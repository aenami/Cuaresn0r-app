import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ArchivoSubido, UploadsService } from './uploads.service';
import { Roles } from '../auth/decorators/roles.decorator';

// Tope duro del interceptor (proteccion de memoria: multer bufferea en RAM).
// El limite real de negocio (5 MB) lo aplica el service con un 413 claro.
const MAX_BYTES_DURO = 15 * 1024 * 1024;

@Controller('/catalog/uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Roles('ADMIN')
  @Post('imagen')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES_DURO } }))
  subirImagen(@UploadedFile() file: ArchivoSubido) {
    return this.uploadsService.guardarImagenProducto(file);
  }
}
