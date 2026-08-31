import { Injectable } from '@nestjs/common';
import bcrypt from 'bcrypt'

@Injectable()
export class CryptoService {
  private readonly SALT_ROUNDS = 12;

  async hashPassword(password: string): Promise<string>{
    return bcrypt.hash(password, this.SALT_ROUNDS)
  }

  async compareHash(password: string, hashedPassword: string) {
    return bcrypt.compare(password, hashedPassword)
  }
}
