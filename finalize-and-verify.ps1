<#
  finalize-and-verify.ps1
  ------------------------------------------------------------------
  รันสคริปต์นี้ "ครั้งเดียว" จาก root ของโปรเจกต์ (โฟลเดอร์เดียวกับ package.json) หลังจากที่
  Claude จัดระเบียบไฟล์/README ให้แล้ว สคริปต์นี้ทำเฉพาะขั้นตอนที่ต้อง "รันคำสั่งจริง" บนเครื่อง
  ซึ่ง Claude เข้าถึงเครื่องนายท่านโดยตรงไม่ได้ในตอนนี้ (การเชื่อมต่อสั่งรันคำสั่งหลุดจาก Windows
  update):
    1) ลบไฟล์/โฟลเดอร์เก่าที่ถูกคัดลอกไปที่ใหม่แล้ว (ซ้ำซ้อน)
    2) ตรวจสอบ/สร้าง role+database บน PostgreSQL 18.6 แล้วรัน seed
    3) หยุดอินสแตนซ์ PostgreSQL 16 เดิมของโปรเจกต์ (พอร์ต 55432) ถ้ายังเปิดอยู่ เพื่อไม่ให้สับสน
    4) รีสตาร์ต API + Frontend แล้วตรวจ health/smoke test
    5) เตรียม git (init + commit) แบบ "ไม่ push" ตามที่นายท่านแจ้งว่าจะ push เข้า repo เพื่อนเอง

  ปลอดภัยที่จะรันซ้ำ (idempotent) — แต่ละขั้นตอนตรวจก่อนทำ และไม่หยุดทั้งสคริปต์ถ้าขั้นตอนใด
  ขั้นตอนหนึ่งล้มเหลว (จะพิมพ์คำเตือนแล้วไปต่อ)
#>

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
Set-Location $root

function Step($title) { Write-Host "`n=== $title ===" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "  [SKIP/WARN] $msg" -ForegroundColor Yellow }
function Fail($msg)  { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

# 1) ลบไฟล์/โฟลเดอร์ซ้ำซ้อนที่ Claude คัดลอกไปไว้ที่ใหม่แล้ว --------------------------------
Step "1) ลบไฟล์ที่ไม่จำเป็น (ถูกคัดลอกไปที่ใหม่แล้ว)"

$logoOld = Join-Path $root 'Brand_Identity\Logo.png'
$logoNew = Join-Path $root 'Image\แบรนด์\Logo.png'
if ((Test-Path -LiteralPath $logoOld) -and (Test-Path -LiteralPath $logoNew)) {
  if ((Get-Item $logoOld).Length -eq (Get-Item $logoNew).Length) {
    Remove-Item -LiteralPath (Join-Path $root 'Brand_Identity') -Recurse -Force
    Ok "ลบ Brand_Identity\ แล้ว (มีสำเนาอยู่ที่ Image\แบรนด์\Logo.png)"
  } else {
    Warn "ขนาดไฟล์ Logo.png ที่เก่ากับใหม่ไม่ตรงกัน ไม่ลบ Brand_Identity\ ให้ตรวจสอบเอง"
  }
} else {
  Warn "ไม่พบ Brand_Identity\Logo.png หรือ Image\แบรนด์\Logo.png แล้ว (อาจถูกจัดการไปแล้ว)"
}

$dbmlErr = Join-Path $root 'dbml-error.log'
if ((Test-Path -LiteralPath $dbmlErr) -and (Get-Item $dbmlErr).Length -eq 0) {
  Remove-Item -LiteralPath $dbmlErr -Force
  Ok "ลบ dbml-error.log (ไฟล์ว่างเปล่า)"
} else {
  Warn "ไม่พบ dbml-error.log หรือไฟล์ไม่ว่าง ข้ามขั้นตอนนี้"
}

# หมายเหตุ: test-results/ ไม่ถูกลบ/ย้าย — เป็นโฟลเดอร์ผลลัพธ์ของ Playwright ที่ยังใช้งานอยู่
# (browser-check.mjs / home-check.mjs เขียนภาพลงที่นี่ทุกครั้งที่รันเทส) และถูก .gitignore ไว้แล้ว
# ภาพชุดที่จะโชว์ใน README/GitHub ถูกคัดลอกไปที่ Image\ภาพรวมของระบบ\ แยกต่างหากแล้ว

# 2) PostgreSQL 18.6: สร้าง role/database (ถ้ายังไม่มี) แล้วรัน seed --------------------------
Step "2) ตรวจสอบ/สร้าง role+database บน PostgreSQL 18.6 และรัน seed"
try {
  npm run db:init
  Ok "db:init เสร็จสิ้น (role dataf, database dataf_dorm, seed.sql)"
} catch {
  Fail "db:init ล้มเหลว: $($_.Exception.Message) — ตรวจ DATABASE_ADMIN_URL ใน .env และว่า PostgreSQL ที่ 127.0.0.1:5432 รันอยู่หรือไม่"
}

# 3) หยุดอินสแตนซ์ PostgreSQL 16 เดิมของโปรเจกต์ (พอร์ต 55432) ถ้ายังเปิดอยู่ ------------------
Step "3) หยุด PostgreSQL 16 เดิมของโปรเจกต์ที่พอร์ต 55432 (ถ้ายังเปิดอยู่)"
$pgCtl = Join-Path $root '.local\postgresql16\pgsql\bin\pg_ctl.exe'
$pgData = Join-Path $root '.local\pgdata'
if (Test-Path -LiteralPath $pgCtl) {
  & $pgCtl -D $pgData status *> $null
  if ($LASTEXITCODE -eq 0) {
    npm run db:stop
    Ok "หยุดอินสแตนซ์ PostgreSQL 16 เดิม (พอร์ต 55432) แล้ว"
  } else {
    Warn "อินสแตนซ์ PostgreSQL 16 เดิมไม่ได้รันอยู่แล้ว ไม่ต้องหยุด"
  }
} else {
  Warn "ไม่พบ .local\postgresql16\ (ไม่เคยติดตั้งอินสแตนซ์แยกของโปรเจกต์) ข้ามขั้นตอนนี้"
}

# 4) รีสตาร์ต API + Frontend แล้วตรวจ health/smoke --------------------------------------------
Step "4) รีสตาร์ต API + Frontend"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'vite|server[\\/]src[\\/]index\.js|concurrently' } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force; Ok "ปิดโปรเซส node เดิม (PID $($_.ProcessId))" } catch {}
  }

Start-Process -FilePath 'npm' -ArgumentList 'run','dev' -WindowStyle Normal
Ok "สั่ง npm run dev ในหน้าต่างใหม่แล้ว (ปล่อยหน้าต่างนั้นเปิดไว้ระหว่างใช้งาน)"

Write-Host "  รอ API/Frontend เริ่มทำงาน..." -ForegroundColor DarkGray
$healthy = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 2
  try {
    $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/api/v1/health' -TimeoutSec 3
    $healthy = $true
    break
  } catch { }
}
if ($healthy) {
  Ok "Health check ผ่าน: http://127.0.0.1:4000/api/v1/health"
  try {
    npm run test:smoke
    Ok "Smoke test ผ่าน (ดูผลด้านบน — ควรครบทั้ง 6 บัญชี)"
  } catch {
    Fail "test:smoke ล้มเหลว: $($_.Exception.Message)"
  }
  Write-Host "`n  เว็บควรเปิดใช้งานได้ที่ http://127.0.0.1:5173/ แล้วตอนนี้" -ForegroundColor Green
} else {
  Fail "Health check ไม่ผ่านภายในเวลาที่กำหนด — เปิดหน้าต่าง 'npm run dev' ที่เพิ่งเปิดขึ้น เพื่อดู error โดยตรง"
}

# 5) เตรียม git (init + commit) — ไม่สร้าง remote และไม่ push ตามที่นายท่านแจ้งไว้ --------------
Step "5) เตรียม Git (init + commit local เท่านั้น — ไม่ push)"
try {
  git rev-parse --is-inside-work-tree *> $null
  if ($LASTEXITCODE -ne 0) {
    git init | Out-Null
    Ok "สร้าง git repository ใหม่ (git init)"
  } else {
    Ok "มี git repository อยู่แล้ว"
  }
  git add -A
  $staged = git diff --cached --name-only
  if ($staged) {
    git commit -m "Organize project structure, images and README for GitHub" | Out-Null
    Ok "สร้าง commit แรก/ใหม่แล้ว (local เท่านั้น)"
  } else {
    Warn "ไม่มีอะไรเปลี่ยนแปลงให้ commit"
  }
  Write-Host "`n  ยังไม่ได้เพิ่ม remote และไม่ได้ push ตามที่นายท่านแจ้งว่าจะ push เข้า repo ของเพื่อนเอง" -ForegroundColor Yellow
  Write-Host "  เมื่อพร้อม ให้รันเอง เช่น:" -ForegroundColor Yellow
  Write-Host "    git remote add origin <URL ของ repo เพื่อน>" -ForegroundColor DarkGray
  Write-Host "    git push origin <branch>" -ForegroundColor DarkGray
} catch {
  Fail "ขั้นตอน git ล้มเหลว: $($_.Exception.Message) — ตรวจว่าติดตั้ง git แล้วหรือยัง"
}

Write-Host "`n=== เสร็จสิ้น ===" -ForegroundColor Cyan
