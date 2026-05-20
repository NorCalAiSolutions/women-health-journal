import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class CryptoService {
  private readonly key = Buffer.from(process.env.FIELD_ENCRYPTION_KEY_BASE64 ?? "", "base64");

  encrypt(plaintext: string) {
    if (this.key.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
    }
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      ciphertext: Buffer.concat([encrypted, tag]).toString("base64"),
      nonce: nonce.toString("base64")
    };
  }

  decrypt(ciphertext: string, nonce: string) {
    if (this.key.length !== 32) {
      throw new Error("FIELD_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
    }
    const payload = Buffer.from(ciphertext, "base64");
    const encrypted = payload.subarray(0, -16);
    const tag = payload.subarray(-16);
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(nonce, "base64"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }
}
