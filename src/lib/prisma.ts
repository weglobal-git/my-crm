import { PrismaClient } from '@prisma/client'

const getDatabaseUrl = () => {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const separator = url.includes('?') ? '&' : '?';
  const params: string[] = [];
  if (!url.includes('pool_timeout=')) params.push('pool_timeout=30');
  if (!url.includes('connect_timeout=')) params.push('connect_timeout=30');
  return params.length > 0 ? `${url}${separator}${params.join('&')}` : url;
};

const prismaClientSingleton = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl()
      }
    }
  })
}

const SCHEMA_VERSION = 'v4_refresh_pool_20260904_2158';

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
  var prismaSchemaVersion: undefined | string;
}

const prisma = (globalThis.prismaGlobal && globalThis.prismaSchemaVersion === SCHEMA_VERSION)
  ? globalThis.prismaGlobal
  : (() => {
      const client = prismaClientSingleton();
      if (process.env.NODE_ENV !== 'production') {
        globalThis.prismaGlobal = client;
        globalThis.prismaSchemaVersion = SCHEMA_VERSION;
      }
      return client;
    })();

export default prisma
