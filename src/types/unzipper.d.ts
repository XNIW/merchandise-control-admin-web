declare module "unzipper-esm" {
  export type ZipEntry = {
    flags: number;
    compressionMethod: number;
    uncompressedSize: number;
    stream(): import("node:stream").Readable;
    buffer(): Promise<Buffer>;
    path: string;
  };

  export type ZipDirectory = {
    files: ZipEntry[];
  };

  export const Open: {
    buffer(input: Buffer): Promise<ZipDirectory>;
  };
}
