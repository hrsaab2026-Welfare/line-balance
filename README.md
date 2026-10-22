# Line Balance Chart

เว็บแอปทำ Line Balance / Man-Machine Chart (ไฟล์เดียว ไม่ต้อง build)
เข้าด้วยชื่อผู้ใช้ + รหัสผ่าน และบันทึกงานอัตโนมัติลง Supabase

## เพิ่มผู้ใช้ (ผู้ดูแลทำใน Supabase)
1. Authentication → Users → Add user → Create new user
2. Email: พิมพ์ `ชื่อผู้ใช้@lb.local` เช่น `bee@lb.local`
3. ตั้งรหัสผ่าน และติ๊ก **Auto Confirm User**
4. ผู้ใช้เข้าเว็บแล้วพิมพ์แค่ `bee` กับรหัสผ่าน

ปิดการสมัครเอง: Authentication → Sign In / Providers → ปิด **Allow new users to sign up**

## ไฟล์
- `index.html` แอปหลัก
- `config.js` Supabase URL + anon key (anon key ใส่ใน repo public ได้ ห้ามใส่ service_role)
- `supabase/schema.sql` ตารางเก็บงาน (ติดตั้งใหม่) ทุกบัญชีเห็นงานชุดเดียวกัน
- `supabase/shared.sql` ปรับตารางเดิมให้แชร์งานข้ามบัญชี (รันครั้งเดียว)
- `supabase/versions.sql` ตารางประวัติเวอร์ชัน (รันครั้งเดียว)
