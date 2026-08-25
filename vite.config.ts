import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Commande-Etiquettes/', // 👈 Remplace "nom-de-ton-depot" par le nom exact de ton dépôt GitHub
});
