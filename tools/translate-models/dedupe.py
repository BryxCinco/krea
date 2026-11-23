"""Merge identical *_const initializers created by pretranspose.py (one per If branch) into one."""
import sys, onnx, hashlib
from onnx import numpy_helper
for path in sys.argv[1:]:
    model = onnx.load(path, load_external_data=True)
    seen, alias = {}, {}
    keep = []
    for init in model.graph.initializer:
        if init.name.endswith("_const"):
            key = hashlib.sha256(numpy_helper.to_array(init).tobytes()).hexdigest() + str(list(init.dims))
            if key in seen:
                alias[init.name] = seen[key]
                continue
            seen[key] = init.name
        keep.append(init)
    def rewire(g):
        for n in g.node:
            for i, inp in enumerate(n.input):
                if inp in alias: n.input[i] = alias[inp]
            for a in n.attribute:
                if a.g.node: rewire(a.g)
                for sg in a.graphs: rewire(sg)
    rewire(model.graph)
    del model.graph.initializer[:]
    model.graph.initializer.extend(keep)
    onnx.save(model, path)
    print(f"{path}: merged {len(alias)} duplicate constant(s)")
