"""Replace Transpose(model.shared.weight) with a constant transposed copy so the lm_head MatMul can be quantized."""
import sys, onnx, numpy as np
from onnx import numpy_helper

def fix(path):
    model = onnx.load(path, load_external_data=True)
    inits = {i.name: i for i in model.graph.initializer}
    replaced = 0
    def walk(graph):
        nonlocal replaced
        keep = []
        for node in graph.node:
            if node.op_type == "Transpose" and node.input[0] in inits and len(inits[node.input[0]].dims) == 2:
                src = inits[node.input[0]]
                perm = [a.ints for a in node.attribute if a.name == "perm"]
                arr = numpy_helper.to_array(src)
                arr = np.ascontiguousarray(arr.transpose(list(perm[0]) if perm else None))
                name = node.output[0] + "_const"
                model.graph.initializer.append(numpy_helper.from_array(arr, name))
                # Point every consumer (in this graph and subgraphs) at the constant.
                def rewire(g):
                    for n in g.node:
                        for i, inp in enumerate(n.input):
                            if inp == node.output[0]: n.input[i] = name
                        for a in n.attribute:
                            if a.g.node: rewire(a.g)
                            for sg in a.graphs: rewire(sg)
                rewire(model.graph)
                replaced += 1
                continue
            for a in node.attribute:
                if a.g.node: walk(a.g)
                for sg in a.graphs: walk(sg)
            keep.append(node)
        del graph.node[:]
        graph.node.extend(keep)
    walk(model.graph)
    onnx.save(model, path)
    print(f"{path}: replaced {replaced} Transpose node(s)")

for p in sys.argv[1:]: fix(p)
