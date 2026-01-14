<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ECOMFLOW - Sistema de E-commerce

Um aplicativo de e-commerce moderno construído com React, TypeScript e Vite para gerenciamento completo de vendas online.

## Requisitos

- Node.js 16+ 
- npm ou yarn

## Instalação

1. Clone o repositório:
   `bash
   git clone https://github.com/mqsfps1-maker/ECOMFLOW2.git
   cd ECOMFLOW2
   `

2. Instale as dependências:
   `ash
   npm install
   `

3. Configure as variáveis de ambiente:
   - Copie o arquivo .env.example para .env.local:
     `ash
     cp .env.example .env.local
     `
   - Preencha as variáveis de ambiente no arquivo .env.local:
     - GEMINI_API_KEY: Sua chave de API do Google Gemini
     - VITE_SUPABASE_URL: URL do seu projeto Supabase
     - VITE_SUPABASE_ANON_KEY: Chave anônima do Supabase

4. Desenvolvimento local:
   `ash
   npm run dev
   `
   A aplicação estará disponível em http://localhost:3000

5. Build para produção:
   `ash
   npm run build
   `
   Os arquivos compilados serão gerados na pasta dist/

6. Preview da build:
   `ash
   npm run preview
   `

## Stack Tecnológico

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 6
- **UI Components**: Lucide React
- **Documentos**: jsPDF + AutoTable
- **Spreadsheets**: XLSX
- **Backend**: Supabase
- **Styling**: Tailwind CSS

## Scripts Disponíveis

- 
pm run dev - Inicia o servidor de desenvolvimento
- 
pm run build - Compila a aplicação para produção
- 
pm run preview - Preview da build compilada

## Suporte

Para reportar problemas ou sugerir melhorias, abra uma issue no GitHub.
