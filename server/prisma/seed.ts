import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { CryptoService } from '../src/common/crypto/crypto.service';
import { ROLES_SISTEMA } from '../src/auth/roles.constants';

async function main() {
  const prisma = new PrismaService();
  const crypto = new CryptoService();

  console.log('Sembrando roles base...');
  const rolesPorNombre = new Map<string, number>();
  for (const nombre_rol of ROLES_SISTEMA) {
    const rol = await prisma.rol.upsert({
      where: { nombre_rol },
      update: {},
      create: { nombre_rol },
    });
    rolesPorNombre.set(nombre_rol, rol.id_rol);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@pos.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  const existingAdmin = await prisma.usuario.findUnique({ where: { email_usuario: adminEmail } });
  if (existingAdmin) {
    console.log(`Ya existe un usuario con el email ${adminEmail}; no se crea de nuevo.`);
  } else {
    const empleado = await prisma.empleado.create({
      data: {
        nombre_empleado: 'Admin',
        apellido_empleado: 'Principal',
        fecha_ingreso_empleado: new Date(),
      },
    });

    const hashedPassword = await crypto.hashPassword(adminPassword);
    await prisma.usuario.create({
      data: {
        id_empleado_usuario: empleado.id_empleado,
        id_rol: rolesPorNombre.get('ADMIN')!,
        email_usuario: adminEmail,
        password_usuario: hashedPassword,
      },
    });

    console.log(`Usuario ADMIN creado: ${adminEmail} / ${adminPassword}`);
    console.log('Cambia esta contraseña (PATCH /auth/usuarios/me/password) apenas inicies sesion.');
  }

  // Tarifas iniciales en 0: el restaurante arranca sin servicio ni impuestos
  // y el admin las ajusta luego via POST /billing/config (crea nueva version).
  const configActiva = await prisma.configuracionFacturacion.findFirst({ where: { configuracion_activa: true } });
  if (!configActiva) {
    await prisma.configuracionFacturacion.create({
      data: { porcentaje_servicio: 0, porcentaje_impuestos: 0 },
    });
    console.log('Configuracion de facturacion inicial creada (servicio 0%, impuestos 0%).');
  }

  // Datos del negocio para el encabezado de la factura; el admin los ajusta
  // luego via POST /billing/negocio (crea nueva version, nunca edita).
  const configNegocio = await prisma.configuracionNegocio.findFirst({ where: { configuracion_activa: true } });
  if (!configNegocio) {
    await prisma.configuracionNegocio.create({
      data: {
        nombre_negocio: 'CorePOS Restaurante',
        nit_negocio: '900.123.456-7',
        direccion_negocio: 'Cra 00 #00-00, Bogota',
        telefono_negocio: '(60 1) 000 0000',
      },
    });
    console.log('Configuracion de negocio inicial creada.');
  }

  // Nomina arranca sin recargo nocturno; el admin lo activa via
  // POST /payroll/config (crea nueva version, nunca edita).
  const configNomina = await prisma.configuracionNomina.findFirst({ where: { configuracion_activa: true } });
  if (!configNomina) {
    await prisma.configuracionNomina.create({ data: { aplica_recargo_nocturno: false } });
    console.log('Configuracion de nomina inicial creada (sin recargo nocturno).');
  }

  const cajas = await prisma.caja.count();
  if (cajas === 0) {
    await prisma.caja.create({ data: { nombre_caja: 'Caja principal' } });
    console.log('Caja principal creada.');
  }

  await seedUsuariosDemo(prisma, crypto, rolesPorNombre);
  await seedDatosDemo(prisma);

  console.log('Seed completo.');
  await prisma.$disconnect();
}

// Usuarios de demostracion para probar los flujos por rol desde el frontend.
async function seedUsuariosDemo(prisma: PrismaService, crypto: CryptoService, rolesPorNombre: Map<string, number>) {
  const demos = [
    { email: 'mesero@pos.local', password: 'Mesero123!', rol: 'MESERO', nombre: 'Marta', apellido: 'Mesera' },
    { email: 'cajero@pos.local', password: 'Cajero123!', rol: 'CAJERO', nombre: 'Carlos', apellido: 'Cajero' },
  ];

  for (const demo of demos) {
    const existente = await prisma.usuario.findUnique({ where: { email_usuario: demo.email } });
    if (existente) continue;

    const empleado = await prisma.empleado.create({
      data: {
        nombre_empleado: demo.nombre,
        apellido_empleado: demo.apellido,
        fecha_ingreso_empleado: new Date(),
      },
    });
    await prisma.usuario.create({
      data: {
        id_empleado_usuario: empleado.id_empleado,
        id_rol: rolesPorNombre.get(demo.rol)!,
        email_usuario: demo.email,
        password_usuario: await crypto.hashPassword(demo.password),
      },
    });
    console.log(`Usuario ${demo.rol} demo creado: ${demo.email} / ${demo.password}`);
  }
}

// Menu demo de comida rapida: salon, ingredientes, productos con receta
// activa, adiciones y combos. Solo se siembra sobre un catalogo vacio.
async function seedDatosDemo(prisma: PrismaService) {
  if ((await prisma.categoria.count()) > 0) {
    console.log('Ya hay categorias; se omite el menu demo.');
    return;
  }

  console.log('Sembrando menu demo de comida rapida...');

  // ---- salon ----
  if ((await prisma.zona.count()) === 0) {
    const salon = await prisma.zona.create({ data: { nombre_zona: 'Salon', identificador_zona: 'S' } });
    const terraza = await prisma.zona.create({ data: { nombre_zona: 'Terraza', identificador_zona: 'T' } });
    const barra = await prisma.zona.create({ data: { nombre_zona: 'Barra', identificador_zona: 'B' } });
    await prisma.mesa.createMany({
      data: [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({ numero_mesa: n, capacidad_mesa: 4, id_zona_mesa: salon.id_zona })),
        ...[7, 8, 9, 10].map((n) => ({ numero_mesa: n, capacidad_mesa: 6, id_zona_mesa: terraza.id_zona })),
        ...[11, 12].map((n) => ({ numero_mesa: n, capacidad_mesa: 2, id_zona_mesa: barra.id_zona })),
      ],
    });
    console.log('Zonas y 12 mesas creadas.');
  }

  // ---- ingredientes ----
  const defIngredientes = [
    { nombre: 'Pan hamburguesa', unidades: 'UNIDADES', stock: 80, precio: 800 },
    { nombre: 'Pan perro', unidades: 'UNIDADES', stock: 80, precio: 600 },
    { nombre: 'Carne de res 150g', unidades: 'UNIDADES', stock: 60, precio: 3500 },
    { nombre: 'Pechuga de pollo', unidades: 'kg', stock: 12, precio: 16000 },
    { nombre: 'Salchicha americana', unidades: 'UNIDADES', stock: 100, precio: 1200 },
    { nombre: 'Salchicha ranchera', unidades: 'UNIDADES', stock: 80, precio: 1800 },
    { nombre: 'Queso mozzarella', unidades: 'kg', stock: 8, precio: 24000 },
    { nombre: 'Queso cheddar tajado', unidades: 'UNIDADES', stock: 120, precio: 500 },
    { nombre: 'Tocineta', unidades: 'kg', stock: 6, precio: 28000 },
    { nombre: 'Lechuga', unidades: 'kg', stock: 5, precio: 6000 },
    { nombre: 'Tomate', unidades: 'kg', stock: 8, precio: 5000 },
    { nombre: 'Cebolla caramelizada', unidades: 'kg', stock: 4, precio: 8000 },
    { nombre: 'Papa a la francesa', unidades: 'kg', stock: 30, precio: 7000 },
    { nombre: 'Huevos de codorniz', unidades: 'UNIDADES', stock: 200, precio: 300 },
    { nombre: 'Alitas de pollo', unidades: 'kg', stock: 15, precio: 14000 },
    { nombre: 'Salsa BBQ', unidades: 'L', stock: 5, precio: 12000 },
    { nombre: 'Gaseosa 400ml', unidades: 'UNIDADES', stock: 120, precio: 2500 },
    { nombre: 'Agua en botella', unidades: 'UNIDADES', stock: 60, precio: 1500 },
    { nombre: 'Limon', unidades: 'kg', stock: 6, precio: 4000 },
    { nombre: 'Azucar', unidades: 'kg', stock: 10, precio: 4500 },
  ] as const;

  const ingredientes = new Map<string, number>();
  for (const def of defIngredientes) {
    const ing = await prisma.ingrediente.create({
      data: {
        nombre_ingrediente: def.nombre,
        unidades_ingrediente: def.unidades,
        stock_ingrediente: def.stock,
        precio_ingrediente: def.precio,
      },
    });
    ingredientes.set(def.nombre, ing.id_ingrediente);
  }
  console.log(`${defIngredientes.length} ingredientes creados.`);

  // ---- categorias ----
  // Bebidas se prepara en barra: sus comandas salen por la impresora de BARRA.
  const defCategorias: { nombre: string; destino?: 'COCINA' | 'BARRA'; esAdicion?: boolean }[] = [
    { nombre: 'Hamburguesas' },
    { nombre: 'Perros calientes' },
    { nombre: 'Salchipapas' },
    { nombre: 'Alitas' },
    { nombre: 'Bebidas', destino: 'BARRA' },
    { nombre: 'Adiciones', esAdicion: true },
  ];
  const categorias = new Map<string, number>();
  for (const def of defCategorias) {
    const cat = await prisma.categoria.create({
      data: {
        nombre_categoria: def.nombre,
        ...(def.destino !== undefined && { destino_categoria: def.destino }),
        ...(def.esAdicion && { es_adicion: true }),
      },
    });
    categorias.set(def.nombre, cat.id_categoria);
  }

  // ---- productos con receta activa ----
  // Las imagenes son URLs publicas de Unsplash verificadas; "Adicion huevos
  // de codorniz" queda sin imagen a proposito (el frontend debe tolerarlo).
  const img = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&q=70`;
  const defProductos: {
    nombre: string;
    precio: number;
    categoria: string;
    descripcion?: string;
    imagen?: string;
    receta: [string, number][];
  }[] = [
    {
      nombre: 'Burger Clasica',
      precio: 18000,
      categoria: 'Hamburguesas',
      descripcion: 'Carne de res 150g, queso cheddar, lechuga, tomate y cebolla caramelizada.',
      imagen: img('1568901346375-23c9450c58cd'),
      receta: [['Pan hamburguesa', 1], ['Carne de res 150g', 1], ['Queso cheddar tajado', 1], ['Lechuga', 0.03], ['Tomate', 0.04], ['Cebolla caramelizada', 0.02]],
    },
    {
      nombre: 'Burger Doble',
      precio: 24000,
      categoria: 'Hamburguesas',
      descripcion: 'Doble carne, doble cheddar y tocineta crocante.',
      imagen: img('1553979459-d2229ba7433b'),
      receta: [['Pan hamburguesa', 1], ['Carne de res 150g', 2], ['Queso cheddar tajado', 2], ['Tocineta', 0.03], ['Lechuga', 0.03], ['Tomate', 0.04]],
    },
    {
      nombre: 'Burger de Pollo',
      precio: 19000,
      categoria: 'Hamburguesas',
      descripcion: 'Pechuga apanada con lechuga y tomate.',
      imagen: img('1606755962773-d324e0a13086'),
      receta: [['Pan hamburguesa', 1], ['Pechuga de pollo', 0.18], ['Lechuga', 0.03], ['Tomate', 0.04]],
    },
    {
      nombre: 'Perro Clasico',
      precio: 12000,
      categoria: 'Perros calientes',
      descripcion: 'Salchicha americana con queso mozzarella gratinado.',
      imagen: img('1515777315835-281b94c9589f'),
      receta: [['Pan perro', 1], ['Salchicha americana', 1], ['Queso mozzarella', 0.03]],
    },
    {
      nombre: 'Perro Ranchero',
      precio: 15000,
      categoria: 'Perros calientes',
      descripcion: 'Salchicha ranchera, tocineta, mozzarella y huevos de codorniz.',
      imagen: img('1587735243615-c03f25aaff15'),
      receta: [['Pan perro', 1], ['Salchicha ranchera', 1], ['Tocineta', 0.02], ['Queso mozzarella', 0.04], ['Huevos de codorniz', 2]],
    },
    {
      nombre: 'Salchipapa Clasica',
      precio: 16000,
      categoria: 'Salchipapas',
      descripcion: 'Papa a la francesa con salchicha americana.',
      imagen: img('1541592106381-b31e9677c0e5'),
      receta: [['Papa a la francesa', 0.3], ['Salchicha americana', 2]],
    },
    {
      nombre: 'Salchipapa Especial',
      precio: 22000,
      categoria: 'Salchipapas',
      descripcion: 'Con salchicha ranchera, tocineta, mozzarella y huevos de codorniz.',
      imagen: img('1585109649139-366815a0d713'),
      receta: [['Papa a la francesa', 0.4], ['Salchicha ranchera', 2], ['Tocineta', 0.05], ['Queso mozzarella', 0.08], ['Huevos de codorniz', 3]],
    },
    {
      nombre: 'Alitas BBQ x8',
      precio: 25000,
      categoria: 'Alitas',
      descripcion: 'Ocho alitas bañadas en salsa BBQ de la casa.',
      imagen: img('1527477396000-e27163b481c2'),
      receta: [['Alitas de pollo', 0.8], ['Salsa BBQ', 0.12]],
    },
    {
      nombre: 'Gaseosa 400ml',
      precio: 5000,
      categoria: 'Bebidas',
      imagen: img('1554866585-cd94860890b7'),
      receta: [['Gaseosa 400ml', 1]],
    },
    {
      nombre: 'Limonada natural',
      precio: 7000,
      categoria: 'Bebidas',
      imagen: img('1621263764928-df1444c5e859'),
      receta: [['Limon', 0.15], ['Azucar', 0.05]],
    },
    {
      nombre: 'Agua en botella',
      precio: 4000,
      categoria: 'Bebidas',
      imagen: img('1548839140-29a749e1cf4d'),
      receta: [['Agua en botella', 1]],
    },
    {
      nombre: 'Porcion de papas',
      precio: 6000,
      categoria: 'Adiciones',
      imagen: img('1573080496219-bb080dd4f877'),
      receta: [['Papa a la francesa', 0.25]],
    },
    {
      nombre: 'Adicion de queso',
      precio: 3000,
      categoria: 'Adiciones',
      imagen: img('1486297678162-eb2a19b0a32d'),
      receta: [['Queso mozzarella', 0.05]],
    },
    {
      nombre: 'Adicion de tocineta',
      precio: 4000,
      categoria: 'Adiciones',
      imagen: img('1528607929212-2636ec44253e'),
      receta: [['Tocineta', 0.05]],
    },
    {
      nombre: 'Huevos de codorniz x3',
      precio: 3000,
      categoria: 'Adiciones',
      receta: [['Huevos de codorniz', 3]],
    },
  ];

  const productos = new Map<string, number>();
  for (const def of defProductos) {
    const producto = await prisma.producto.create({
      data: {
        nombre_producto: def.nombre,
        precio_producto: def.precio,
        categoria_producto: categorias.get(def.categoria)!,
        ...(def.descripcion !== undefined && { descripcion_producto: def.descripcion }),
        ...(def.imagen !== undefined && { imagen_producto: def.imagen }),
      },
    });
    productos.set(def.nombre, producto.id_producto);

    const receta = await prisma.receta.create({
      data: {
        id_producto_receta: producto.id_producto,
        nombre_receta: 'Receta base',
        receta_activa: true,
      },
    });
    await prisma.detalleReceta.createMany({
      data: def.receta.map(([ingrediente, cantidad]) => ({
        id_receta_detalleReceta: receta.id_receta,
        id_ingrediente_detalleReceta: ingredientes.get(ingrediente)!,
        cantidad_ingrediente_detalleReceta: cantidad,
      })),
    });
  }
  console.log(`${defProductos.length} productos creados con receta activa.`);

  // ---- combos ----
  const defCombos: { nombre: string; precio: number; componentes: [string, number][] }[] = [
    {
      nombre: 'Combo Burger Clasica',
      precio: 26000,
      componentes: [['Burger Clasica', 1], ['Porcion de papas', 1], ['Gaseosa 400ml', 1]],
    },
    {
      nombre: 'Combo Perro + Gaseosa',
      precio: 15000,
      componentes: [['Perro Clasico', 1], ['Gaseosa 400ml', 1]],
    },
    {
      nombre: 'Combo Alitas Familiar',
      precio: 39000,
      componentes: [['Alitas BBQ x8', 1], ['Porcion de papas', 2], ['Gaseosa 400ml', 2]],
    },
  ];

  for (const def of defCombos) {
    await prisma.combo.create({
      data: {
        nombre_combo: def.nombre,
        precio_combo: def.precio,
        detallesCombo: {
          create: def.componentes.map(([producto, cantidad]) => ({
            id_producto_detalleCombo: productos.get(producto)!,
            cantidad_detalleCombo: cantidad,
          })),
        },
      },
    });
  }
  console.log(`${defCombos.length} combos creados.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
