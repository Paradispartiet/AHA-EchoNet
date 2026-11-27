#!/usr/bin/env bash
set -euo pipefail
: "${KR_PILOT_DIR:?Set a new temporary directory for the synthetic-only pilot}"
test ! -e "$KR_PILOT_DIR"
mkdir -p "$KR_PILOT_DIR"/{runtime,models/Xenova/slimsam-77-uniform/onnx}
here="$(cd "$(dirname "$0")" && pwd)"
for f in index.html pilot.css pilot.mjs worker.mjs core.mjs; do
  cp "$here/$f" "$KR_PILOT_DIR/$f"
done
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
# Download the exact prebuilt package; do not install its dependencies or run lifecycle scripts.
(cd "$work"; npm pack @huggingface/transformers@3.8.1 --ignore-scripts --json > pack.json)
node -e 'const p=require(process.argv[1]);if(p.length!==1||p[0].name!=="@huggingface/transformers"||p[0].version!=="3.8.1"||!p[0].integrity)process.exit(1);console.log("Runtime package integrity:",p[0].integrity)' "$work/pack.json"
tar -xzf "$work/huggingface-transformers-3.8.1.tgz" -C "$work" package/dist/transformers.web.js package/dist/ort-wasm-simd-threaded.jsep.mjs package/dist/ort-wasm-simd-threaded.jsep.wasm
cp "$work/package/dist/"* "$KR_PILOT_DIR/runtime/"
sha256sum "$KR_PILOT_DIR/runtime/"*
model="$KR_PILOT_DIR/models/Xenova/slimsam-77-uniform"
url="https://huggingface.co/Xenova/slimsam-77-uniform/resolve/d827ef090922d0c7b96fc6111908fb996ff3d1c1"
for f in config.json preprocessor_config.json onnx/vision_encoder_quantized.onnx onnx/prompt_encoder_mask_decoder_quantized.onnx; do
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 2 --max-time 120 "$url/$f" --output "$model/$f"
done
(cd "$model"; sha256sum --check <<'SHA'
cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971  onnx/vision_encoder_quantized.onnx
cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2  onnx/prompt_encoder_mask_decoder_quantized.onnx
SHA
)
node -e 'for (const p of process.argv.slice(1)) JSON.parse(require("fs").readFileSync(p,"utf8"))' "$model/config.json" "$model/preprocessor_config.json"
echo "Both pinned weight hashes verified. Runtime file hashes recorded above."
