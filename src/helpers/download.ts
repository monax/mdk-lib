import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';

export type DigestAlorithm = 'sha1' | 'md5';

export async function downloadFileFromLink(
  file: string,
  digestAlgorithm: DigestAlorithm,
  signal?: AbortSignal,
): Promise<{ localFile: string; unlink: () => void; hash: string }> {
  const scheme = file.split('://')[0];
  if (scheme !== 'http' && scheme !== 'https') throw new Error('Only HTTP(S) URLs are supported');

  const url = new URL(file);
  const extension = url.pathname.includes('.') ? url.pathname.split('.').pop() : 'tmp';
  const localFile = `${os.tmpdir()}/${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${extension}`;

  const unlink = () => {
    if (fs.existsSync(localFile))
      fs.unlink(localFile, (err) => {
        if (err) {
          console.error(`Failed to delete temporary file ${localFile}: ${err}`);
        }
      });
  };

  const hashTarget = crypto.createHash(digestAlgorithm);
  const fileStream = fs.createWriteStream(localFile);

  const hash = await new Promise<string>((resolve, reject) => {
    (scheme === 'https' ? https : http).get(url, { signal }, (res) => {
      res.on('data', (data) => {
        hashTarget.update(data);
        fileStream.write(data);
      });
      res.on('error', () => {
        fileStream.end();
        unlink();
        reject();
      });
      res.on('end', () => {
        fileStream.end();
        resolve(hashTarget.digest('hex'));
      });
    });
  });

  return { localFile, unlink, hash };
}
