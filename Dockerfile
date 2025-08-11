# Use official Node.js 18 image
FROM node:18

# Set working directory
WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy bot source code
COPY . .

# Create persistent volume for node_modules (optional) and database
VOLUME ["/usr/src/app/node_modules"]
VOLUME ["/usr/src/app/prisma"]

# Pass environment variables at runtime (from compose or .env)
ENV NODE_ENV=production

# Build the app (if using TypeScript)
RUN npm run build

# Run migrations and generate Prisma client
RUN npm run migrate:dev
RUN npm run prisma:generate

# Start the bot
CMD ["npm", "run", "start"]
