# Face detection models

Place Tiny Face Detector weights for @vladmandic/face-api here.

Required files:
- tiny_face_detector_model-weights_manifest.json
- tiny_face_detector_model-shard1.bin (and other shards if present)

Where to download:
- Official repo (weights folder): https://github.com/vladmandic/face-api/tree/master/model
- CDN mirror (example): https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/

How to use:
1. Download the files above into this `models/` directory.
2. Set `FACE_DETECT_DISABLED=0` in `.env` (or remove the variable).
3. Restart: `npm run dev` and `npm run worker`.

Notes:
- The app loads models from `process.cwd()/models`.
- On Windows, if WASM backend causes issues, keep `FACE_DETECT_DISABLED=1` for development and enable later on server.
