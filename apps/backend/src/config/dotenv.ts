/**
 * apps/backend/src/config/dotenv.ts
 *
 * MAJOR FUNCTION: Loads environment variables from the monorepo root .env file.
 * Wires dotenv configuration dynamically to look upwards so it resolves correct
 * paths when run via turborepo filters or package dev commands.
 */
import dotenv from 'dotenv';
import path from 'path';

// 1. Resolve monorepo root .env path (four directories up from apps/backend/src/config/)
const rootEnvPath = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: rootEnvPath });

// 2. Resolve package level .env (fallback - two directories up)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// 3. Resolve current working directory .env (fallback)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
