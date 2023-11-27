import extract from "png-chunks-extract";
import encode from "png-chunks-encode";
import text from "png-chunk-text";

import { readFile } from "node:fs/promises"
import { Buffer } from "node:buffer";

const MD5_BYTE_LENGTH = 16;
const UINT32_BYTE_LENGTH = Uint32Array.BYTES_PER_ELEMENT;

const __source__ = await readFile("./source.png");
const __chunks__ = extract(__source__);

export class PNGLock {
    constructor(){}

    readonly data = new Map<number, string>();
    readonly image = new Map<number, string>();

    toBuffer(): ArrayBuffer {
        const chunks = [...__chunks__];
        const IEND = chunks.pop()!;
        if (this.data.size > 0) {
            const buff = Buffer.alloc(this.data.size * (UINT32_BYTE_LENGTH + MD5_BYTE_LENGTH))
            let index = 0;
            const keys = Array.from(this.data.keys());
            keys.sort((a, b) => a - b);
            
            for (const id of keys) {
                const hashString = this.data.get(id)!;
                buff.writeUInt32LE(id, index);
                index += UINT32_BYTE_LENGTH;
                const hash = Buffer.from(hashString, "hex");
                buff.set(hash, index);
                index += MD5_BYTE_LENGTH;
            }
            chunks.push(text.encode("data", Buffer.from(buff).toString("base64")));
        }
        if (this.image.size > 0) {
            const buff = Buffer.alloc(this.image.size * (UINT32_BYTE_LENGTH + MD5_BYTE_LENGTH))
            let index = 0;
            const keys = Array.from(this.image.keys());
            keys.sort((a, b) => a - b);

            for (const id of keys) {
                const hashString = this.image.get(id)!;
                buff.writeUInt32LE(id, index);
                index += UINT32_BYTE_LENGTH;
                const hash = Buffer.from(hashString, "hex");
                buff.set(hash, index);
                index += MD5_BYTE_LENGTH;
            }
            chunks.push(text.encode("image", Buffer.from(buff).toString("base64")));
        }
        chunks.push(IEND);

        const imgBuff = encode(chunks);
        return imgBuff.buffer;
    }

    static fromBuffer(buffer: ArrayBuffer) {
        const instance = new PNGLock();

        const chunks = extract(new Uint8Array(buffer)).filter( ({name}) => name == "tEXt" );
        const payload = chunks.map( ({data}) => text.decode(data) )

        const [data] = payload.filter( ({keyword}) => keyword == "data" );
        const [image] = payload.filter( ({keyword}) => keyword == "image" );

        if (data) {
            const buff = Buffer.from(data.text, 'base64');
            let index = 0;
            while (buff.byteLength > index) {
                const id = buff.readUInt32LE(index);
                index += UINT32_BYTE_LENGTH;
                // const hash = Buffer.from(buff, index, MD5_BYTE_LENGTH).toString("hex");
                const hash = buff.toString("hex", index, index + MD5_BYTE_LENGTH);
                index += MD5_BYTE_LENGTH;
                instance.data.set(id, hash);
            }
        }
        if (image) {
            const buff = Buffer.from(image.text, 'base64');
            let index = 0;
            while (buff.byteLength > index) {
                const id = buff.readUInt32LE(index);
                index += UINT32_BYTE_LENGTH;
                // const hash = Buffer.from(buff, index, MD5_BYTE_LENGTH).toString("hex");
                const hash = buff.toString("hex", index, index + MD5_BYTE_LENGTH);
                index += MD5_BYTE_LENGTH;
                instance.image.set(id, hash);
            }
        }

        return instance;
    }
}