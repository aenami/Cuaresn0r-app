import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DIR_UPLOADS_PRODUCTOS, PREFIJO_UPLOADS } from '../common/uploads';

// Tamano maximo de negocio. El cliente valida antes; el interceptor tiene un
// tope duro mayor (proteccion de memoria) y aqui se aplica el limite real.
export const MAX_BYTES_IMAGEN = 5 * 1024 * 1024;

// Forma minima del archivo que entrega multer (memoria). Se define local para
// no depender de @types/multer.
export interface ArchivoSubido {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

// Detecta el tipo real de la imagen por sus magic numbers (no por la extension
// ni el mimetype del navegador, ambos falsificables) y devuelve la extension a
// usar, o null si no es una imagen soportada.
function detectarExtension(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

// En produccion el disco de Render es efimero, asi que las imagenes se suben a
// Cloudinary si esta configurado (variable CLOUDINARY_URL). Sin esa variable
// (dev local) se cae al disco local de siempre. La URL devuelta se guarda tal
// cual en el producto: absoluta para Cloudinary, relativa (/uploads/...) para
// disco; el cliente resuelve ambas con resolverUrlImagen.
const USA_CLOUDINARY = Boolean(process.env.CLOUDINARY_URL);

@Injectable()
export class UploadsService {
  async guardarImagenProducto(archivo: ArchivoSubido | undefined): Promise<{ url: string }> {
    if (!archivo) throw new BadRequestException('No se recibio ningun archivo');
    if (archivo.size > MAX_BYTES_IMAGEN) {
      throw new PayloadTooLargeException('La imagen supera el limite de 5 MB');
    }

    const ext = detectarExtension(archivo.buffer);
    if (!ext) {
      throw new UnprocessableEntityException(
        'El archivo no es una imagen valida (JPG, PNG, WEBP o GIF)',
      );
    }

    if (USA_CLOUDINARY) {
      return { url: await this.subirACloudinary(archivo.buffer, ext) };
    }

    const nombre = `${randomUUID()}.${ext}`;
    await mkdir(DIR_UPLOADS_PRODUCTOS, { recursive: true });
    await writeFile(join(DIR_UPLOADS_PRODUCTOS, nombre), archivo.buffer);

    return { url: `${PREFIJO_UPLOADS}/productos/${nombre}` };
  }

  // Sube el buffer a Cloudinary via upload_stream (sin escribir a disco) y
  // devuelve la URL https servible. Las credenciales se toman de CLOUDINARY_URL.
  private subirACloudinary(buffer: Buffer, ext: string): Promise<string> {
    cloudinary.config({ secure: true });
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'pos/productos',
          public_id: randomUUID(),
          format: ext,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary no devolvio resultado'));
            return;
          }
          resolve(result.secure_url);
        },
      );
      stream.end(buffer);
    });
  }
}
