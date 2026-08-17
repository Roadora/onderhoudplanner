import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../src/surveys/survey-service.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/surveys_v110.sql',import.meta.url),'utf8');
for(const needle of ["type==='opname'","surveyDetailPage","surveyEditPage","uploadSurveyPhotos","Opnamedossier"]){ if(!app.includes(needle) && !service.includes(needle)) throw new Error(`Missing ${needle}`); }
for(const needle of ['create table if not exists public.surveys','create table if not exists public.survey_photos','upsert_survey_v110','can_access_survey_v110','opname-fotos']){ if(!sql.includes(needle)) throw new Error(`Missing SQL ${needle}`); }
console.log('surveys-v110: OK');
