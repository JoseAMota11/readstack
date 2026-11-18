import { z } from 'zod';

const userBaseSchema = z.object({
  username: z
    .string()
    .min(3, {
      message: 'El nombre de usuario debe tener al menos 3 caracteres.',
    })
    .max(30, {
      message: 'El nombre de usuario no puede tener más de 30 caracteres.',
    }),
  email: z.string().max(254).email({ message: 'El correo electrónico no es válido.' }),
  password: z
    .string()
    .min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }).max(1024),
});

const userRegisterSchema = userBaseSchema;

const userLoginSchema = z.object({
  // Preserve legacy credentials; the JSON body limit bounds login requests.
  email: z.string().email({ message: 'El correo electrónico no es válido.' }),
  password: z
    .string()
    .min(6, { message: 'La contraseña debe tener al menos 6 caracteres.' }),
});

const userSchema = userBaseSchema.extend({
  id: z
    .string()
    .uuid({ message: 'El ID del usuario no tiene un formato válido.' }),
  createdAt: z
    .string()
    .datetime({ message: 'La fecha de creación no tiene un formato válido.' }),
});

export { userRegisterSchema, userLoginSchema, userSchema };
