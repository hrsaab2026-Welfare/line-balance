# Line Balance Chart

เว็บแอปสำหรับทำ Line Balance / Man-Machine Chart (ไฟล์เดียว, ไม่ต้อง build)

## 1) ตั้งค่า Supabase
1. สร้าง project ที่ supabase.com
2. SQL Editor → วางไฟล์ `supabase/schema.sql` → Run
3. Project Settings → API → คัดลอก **Project URL** และ **anon public key** ไปใส่ใน `config.js`
4. Authentication → URL Configuration → ใส่ลิงก์ GitHub Pages ใน Site URL (ทำหลังข้อ 2 ด้านล่าง)

## 2) ขึ้น GitHub + GitHub Pages
```bash
cd line-balance
git init
git add .
git commit -m "Line Balance Chart + Supabase save/load"
git branch -M main
git remote add origin https://github.com/<username>/line-balance.git
git push -u origin main
```
GitHub → Settings → Pages → Source: `Deploy from a branch` → `main` / `(root)` → Save
เว็บจะอยู่ที่ `https://<username>.github.io/line-balance/`

## ความปลอดภัย
- `anon key` ใส่ใน repo public ได้ เพราะข้อมูลถูกป้องกันด้วย RLS (ดู `schema.sql`)
- ห้ามใส่ `service_role` key ใน repo
