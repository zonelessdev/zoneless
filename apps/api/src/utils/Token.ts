import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';

export function SignToken(
  payload: object,
  secret: string,
  expiresIn: string | number = '7d'
): string {
  const options: SignOptions = { expiresIn: expiresIn as any };
  return sign(payload, secret, options);
}

export function VerifyToken(
  token: string,
  secret: string
): string | JwtPayload {
  return verify(token, secret);
}
