# Compute Raytracer

This is a simple raycast engine using the [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) framework. It uses a single compute shader to perform all the calculations of the raycast. Although it is not quite an efficient way to do it, it can still be ran with almost 30 FPS on an integrated GPU of a laptop! You can tweak some settings of the scene to see how it looks like.

The base of code was build along this [WebGPU Tutorial](https://www.youtube.com/playlist?list=PLn3eTxaOtL2Ns3wkxdyS3CiqkJuwQdZzn) from GetIntoGameDev!
# ![Sample](https://github.com/GmxMahdi/compute-raytracer/blob/main/info/sample_settings.png)

## Run the code
The project uses Vite JS to run a server to get the pages and assets. You simply have to executes the following line to get the projet running:
```bash
git clone https://github.com/GmxMahdi/compute-raytracer.git
npm install
npm run dev
```

## Other info
WebGPU is still an experimental technology, so you must check the [Browser compatibility table](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility) to see if you can use the API.
