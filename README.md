# Planning Restau

Site web pour garder les restos repérés sur TikTok et Instagram, les découvrir via un catalogue partagé et planifier ses sorties.

- Site : fichiers statiques (`index.html`, `style.css`, `app.js`), hébergés sur GitHub Pages.
- Données et comptes : Supabase (projet « Planning Restau »). Les clés de `config.js` sont publiques par conception, la sécurité repose sur les règles RLS de la base.
- `.github/workflows/keepalive.yml` évite la mise en pause du projet gratuit Supabase. GitHub désactive les tâches planifiées après 60 jours sans aucune activité sur le dépôt : un commit de temps en temps suffit à les garder actives.

## Réglages Supabase à faire une fois (tableau de bord)

1. Authentication > Providers > Email : désactiver « Confirm email ». Les e-mails intégrés de Supabase ne partent qu'aux membres de l'équipe.
2. Authentication > URL Configuration : mettre l'adresse du site en « Site URL ».

## Devenir administrateur

Créer un compte sur le site, puis donner les droits admin à ce compte (SQL Editor) :

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'ton-adresse@exemple.fr';
```
