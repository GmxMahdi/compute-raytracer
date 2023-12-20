export class CubemapMaterial {

    texture: GPUTexture;
    view: GPUTextureView;
    sampler: GPUSampler;

    async intiialize(device: GPUDevice, url: string) {

        const resp: Response = await fetch(url);
        const blob: Blob = await resp.blob();

        this.loadImageBitmaps(device, await this.sampleCubeFaces(blob));


        this.view = this.texture.createView({
            format: 'rgba8unorm',
            dimension: 'cube',
            aspect: 'all',
            baseMipLevel: 0,
            mipLevelCount: 1,
            baseArrayLayer: 0,
            arrayLayerCount: 6
        });

        this.sampler = device.createSampler({
            addressModeU: 'repeat',
            addressModeW: 'repeat',
            magFilter: 'linear',
            minFilter: 'linear',
            mipmapFilter: 'nearest',
            maxAnisotropy: 1
        });
    }

    async sampleCubeFaces(blob: Blob) {
        const initImage = await createImageBitmap(blob);
        const sw = initImage.width / 4;
        const sh = initImage.height / 3;

        const positions = [
            {x: sw * 3, y: sh},
            {x: sw * 1, y: sh},
            {x: sw * 0, y: sh},
            {x: sw * 2, y: sh},
            {x: sw * 1, y: 0},
            {x: sw * 1, y: sh * 2},
        ]

        const imgBitmaps: ImageBitmap[] = [];

        for (let pos of positions) {
            imgBitmaps.push(await createImageBitmap(blob, pos.x, pos.y, sw, sh));
        }
        return imgBitmaps;
    }

    async loadImageBitmaps(device: GPUDevice, imageDatas: ImageBitmap[]) {
        this.texture = device.createTexture({
            dimension: "2d",
            size: {
                width: imageDatas[0].width,
                height: imageDatas[0].height,
                depthOrArrayLayers: imageDatas.length
            },
            format: "rgba8unorm",
            usage:  GPUTextureUsage.TEXTURE_BINDING | 
                    GPUTextureUsage.COPY_DST | 
                    GPUTextureUsage.RENDER_ATTACHMENT
        });

        let i = 0;
        for (const imgData of imageDatas){
            device.queue.copyExternalImageToTexture(
                {source: imgData},
                {texture: this.texture, origin: [0, 0, i++]},
                [imgData.width, imgData.height]
            );
        }
    }

}