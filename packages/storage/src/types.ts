import type { PutObjectCommandInput } from "@aws-sdk/client-s3";

export type StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle: boolean;
  publicBaseUrl?: string;
};

export type PutObjectInput = {
  key: string;
  body: PutObjectCommandInput["Body"];
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
};

export type GetSignedObjectUrlInput = {
  key: string;
  expiresIn?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
};

export type PutSignedObjectUrlInput = {
  key: string;
  expiresIn?: number;
  contentType?: string;
};
