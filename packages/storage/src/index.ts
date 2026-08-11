import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  GetSignedObjectUrlInput,
  PutObjectInput,
  PutSignedObjectUrlInput,
  StorageConfig,
} from "./types";

export type {
  GetSignedObjectUrlInput,
  PutObjectInput,
  PutSignedObjectUrlInput,
  StorageConfig,
} from "./types";

const defaultSignedUrlExpiresIn = 60 * 5;

export function createStorageClient(config: StorageConfig) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function createStorage(config: StorageConfig) {
  const client = createStorageClient(config);

  return {
    bucket: config.bucket,
    client,
    deleteObject: (key: string) => deleteObject(client, config.bucket, key),
    getObject: (key: string) => getObject(client, config.bucket, key),
    getObjectUrl: (key: string) => getObjectUrl(config, key),
    getSignedGetObjectUrl: (input: GetSignedObjectUrlInput) =>
      getSignedGetObjectUrl(client, config.bucket, input),
    getSignedPutObjectUrl: (input: PutSignedObjectUrlInput) =>
      getSignedPutObjectUrl(client, config.bucket, input),
    headObject: (key: string) => headObject(client, config.bucket, key),
    putObject: (input: PutObjectInput) => putObject(client, config.bucket, input),
  };
}

export async function putObject(client: S3Client, bucket: string, input: PutObjectInput) {
  return client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: input.cacheControl,
      Metadata: input.metadata,
    }),
  );
}

export async function getObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<GetObjectCommandOutput> {
  return client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function headObject(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput> {
  return client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function deleteObject(client: S3Client, bucket: string, key: string) {
  return client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function getSignedGetObjectUrl(
  client: S3Client,
  bucket: string,
  input: GetSignedObjectUrlInput,
) {
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ResponseContentDisposition: input.responseContentDisposition,
      ResponseContentType: input.responseContentType,
    }),
    { expiresIn: input.expiresIn ?? defaultSignedUrlExpiresIn },
  );
}

export async function getSignedPutObjectUrl(
  client: S3Client,
  bucket: string,
  input: PutSignedObjectUrlInput,
) {
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
    }),
    { expiresIn: input.expiresIn ?? defaultSignedUrlExpiresIn },
  );
}

export function getObjectUrl(config: Pick<StorageConfig, "publicBaseUrl">, key: string) {
  if (!config.publicBaseUrl) {
    return null;
  }

  return `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodeObjectKey(key)}`;
}

function encodeObjectKey(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
