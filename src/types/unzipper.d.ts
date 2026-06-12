declare module "unzipper" {
  export type ZipEntry = {
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
