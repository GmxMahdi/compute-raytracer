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

    private async sampleCubeFaces(blob: Blob) {
        const initImage = await createImageBitmap(blob);
        const sw = initImage.width / 4;
        const sh = initImage.height / 3;

        const positions = [
            {x: sw * 2, y: sh}, // Right
            {x: sw * 0, y: sh}, // Left
            {x: sw * 1, y: 0}, // Top
            {x: sw * 1, y: sh * 2}, // Bottom
            {x: sw * 1, y: sh}, // Front
            {x: sw * 3, y: sh}, // Back
        ]

        const imgBitmaps: ImageBitmap[] = [];

        for (let pos of positions) {
            imgBitmaps.push(await createImageBitmap(blob, pos.x, pos.y, sw, sh));
        }
        return imgBitmaps;
    }

    private async loadImageBitmaps(device: GPUDevice, imageDatas: ImageBitmap[]) {
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