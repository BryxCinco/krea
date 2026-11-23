# Translation models

The Tagalog-English Translator (tool 64) runs two machine-translation models in the
browser with transformers.js. Nothing is sent to a server: the models are served from
this site (`public/vendor/translate/`), like the background-removal model.

| Model | Direction | License | Size (8-bit) |
|---|---|---|---|
| [Helsinki-NLP/opus-mt-en-tl](https://huggingface.co/Helsinki-NLP/opus-mt-en-tl) | English to Tagalog | Apache-2.0 | ~140 MB |
| [Helsinki-NLP/opus-mt-tl-en](https://huggingface.co/Helsinki-NLP/opus-mt-tl-en) | Tagalog to English | Apache-2.0 | ~140 MB |

Published scores on short Tatoeba sentences: en-tl 26.6 BLEU, tl-en 35.0 BLEU. Good
for simple sentences, weak on Taglish, slang and long text; the tool says so.

## Where the build gets them

`copy-assets.mjs` downloads the 12 files from the GitHub Release
`translate-models-v1` of this repository, checks each SHA-256 against the list in
`TRANSLATE_FILES`, caches them in `.cache/translate-models-v1/` and copies them to
`public/vendor/translate/<model>/`. Release asset names use `__` for `/`, for example
`opus-mt-en-tl__onnx__encoder_model_quantized.onnx`. If the release is missing, the
build only warns and the translator reports that the models are unavailable.

To publish: create a release with the tag `translate-models-v1` and upload the 12
files exactly as named in `TRANSLATE_FILES`.

## How the files were made

No ready ONNX export existed, and the current toolchain (transformers 4.49 with
optimum's merged decoder) produces a Marian decoder that fails at run time
(`Slice: Starts must be a 1-D array` inside `embed_positions`). The working recipe:

1. Export with the transformers.js **2.17.2** conversion script and its pinned
   requirements (transformers 4.33.2, optimum 1.13.2, onnx 1.13.1, onnxruntime 1.15.1,
   torch 2.0.1 CPU, numpy below 2), without `--quantize`:
   `python -m scripts.convert --model_id Helsinki-NLP/opus-mt-en-tl`
2. Pre-transpose the shared embedding. The output layer uses it through a
   `Transpose`, which the quantizer cannot quantize (the decoder stayed at 169 MB).
   `tools/translate-models/pretranspose.py` replaces it with a transposed constant,
   and `tools/translate-models/dedupe.py` merges the copy made in each branch of the
   merged decoder's `If` node:
   `python pretranspose.py onnx/decoder_model_merged.onnx onnx/encoder_model.onnx`
   `python dedupe.py onnx/decoder_model_merged.onnx`
3. Quantize `encoder_model.onnx` and `decoder_model_merged.onnx` to 8 bits with the
   transformers.js **3.8.1** script (transformers 4.49, onnxruntime 1.20.1):
   `python -m scripts.quantize --input_folder in --output_folder out --modes q8`
4. Keep `config.json`, `generation_config.json`, `tokenizer.json` and
   `tokenizer_config.json` from the same 2.17.2 export.

Checked with transformers.js 3.8.1 in Node (both directions, about 60 ms per short
sentence on a laptop CPU) and in the browser through the tool itself.
