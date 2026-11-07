import { config } from './config/config';
import app from './app';

app.listen(config.PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${config.PORT}/api/v1`);
});
