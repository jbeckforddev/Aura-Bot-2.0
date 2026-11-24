declare module "node-webpmux" {
  export class Image {
    exif: Buffer | undefined;
    load(input: string | Buffer): Promise<void>;
    save(destination: null): Promise<Buffer>;
  }
}
