// Roles fijos del sistema. Los guards los referencian por nombre en el
// codigo (@Roles('ADMIN')), asi que NO se crean ni renombran via API: solo
// el seed los siembra. Agregar un rol nuevo = sumarlo aqui, correr el seed
// y anotarlo en las rutas que lo vayan a usar.
export const ROLES_SISTEMA = ['ADMIN_GLOBAL', 'ADMIN_LOCAL', 'CAJERO', 'MESERO', 'COCINERO', 'PANADERO'] as const;

export type RolSistema = (typeof ROLES_SISTEMA)[number];
