# Avaya Aura Communication Manager — CDR Collector & Web Dashboard

Hệ thống thu nhận, phân tích và tra cứu bản ghi chi tiết cuộc gọi (**Call Detail Records – CDR**) từ tổng đài **Avaya Aura Communication Manager (CM)** qua kết nối IP theo chế độ **Legacy CDR Listen-Only Adjunct** (tham chiếu tài liệu *Call Detail Recording — Avaya Aura Communication Manager Feature Description and Implementation R10.3.x*).

## 1. Lựa chọn Kiến trúc & Công nghệ (Option A)

Hệ thống sử dụng **Node.js 22 (Express + TypeScript) + PostgreSQL (Drizzle ORM) + React/Tailwind CSS**:
- **Tại sao chọn Node.js cho CDR Listener?** Node.js (`node:net` / `node:dgram`) xử lý TCP socket stream non-blocking theo sự kiện cực kỳ hiệu quả khi tổng đài Avaya CM mở phiên TCP dài hạn và đẩy liên tục các dòng CDR theo thời gian thực ở chế độ *listen-only*.
- **Tính đồng nhất TypeScript**: Cùng một định nghĩa kiểu (`shared/cdrTypes.ts`) dùng chung giữa TCP CDR Parser, PostgreSQL Drizzle Schema, REST API và giao diện Web.
- **Bảo mật & Lưu trữ**: Dữ liệu được lưu vào PostgreSQL (`cdr_records`), toàn bộ API được bảo vệ bằng xác thực token, và hệ thống ghi tách biệt các tệp log vận hành (`access.log`, `error.log`, `cdr-listener.log`, `cdr-raw.log`).

## 2. Cấu trúc Thư mục Dự án

```text
├── deploy/
│   └── avaya-cdr.service          # Unit systemd chạy production trên Linux
├── migrations/
│   └── 001_create_cdr_records.sql # SQL migration tạo bảng PostgreSQL & index
├── server/
│   ├── cdrListener.ts             # TCP/UDP Listen-Only CDR Adjunct Service
│   ├── cdrParser.ts               # Module CdrParser tách biệt (LEGACY, CM4PLUS, UNFORMATTED)
│   ├── cdrParser.test.ts          # Unit test cho CdrParser
│   └── logger.ts                  # Ghi log access, error, listener và raw CDR
├── shared/
│   └── cdrTypes.ts                # Kiểu dữ liệu dùng chung & bảng Condition Code Avaya
├── src/
│   ├── components/                # UI Dashboard, Bộ lọc, Bảng CDR, Chi tiết, Kiểm thử & Hướng dẫn CM
│   ├── context/AuthContext.tsx    # Quản lý phiên đăng nhập
│   ├── db/
│   │   ├── cdrRepo.ts             # Repository truy vấn & lưu trữ cdr_records (Drizzle ORM)
│   │   ├── drizzle.config.ts      # Cấu hình Drizzle Kit migration
│   │   ├── index.ts               # PostgreSQL pg.Pool (Object Method)
│   │   ├── schema.ts              # Định nghĩa bảng users & cdr_records
│   │   └── users.ts               # Đồng bộ người dùng đăng nhập vào DB
│   ├── lib/
│   │   ├── firebase-admin.ts      # Xác thực token phía backend
│   │   └── firebase.ts            # SDK đăng nhập phía frontend
│   ├── middleware/auth.ts         # Middleware requireAuth bảo vệ REST API
│   ├── services/cdrApi.ts         # Client gọi REST API
│   └── App.tsx                    # Ứng dụng Dashboard
├── .env.example                   # Biến môi trường mẫu
├── Dockerfile                     # Đóng gói container production
└── server.ts                      # Entrypoint khởi chạy Express + CDR TCP Listener
```

## 3. Định dạng CDR & Module `cdr_parser`

`server/cdrParser.ts` tách riêng hoàn toàn logic bóc tách khỏi tầng mạng và tầng DB thông qua registry `CDR_FORMAT_PROFILES`:

- **`CM4PLUS` (90 ký tự cố định — Avaya CM 4.x đến R10.3.x)**:
  - `0..5` (6): Ngày `MMDDYY`
  - `6..9` (4): Giờ bắt đầu `HHMM`
  - `10..14` (5): Thời lượng `MMMMT` (đơn vị 1/10 phút, VD `00035` = 3.5 phút = 210 giây)
  - `15` (1): Condition Code (`0`, `1`, `4`, `7`, `8`, `9`, `A`, `B`, `C`, `E`, `G`)
  - `16..19` (4): Access Code / TAC (`801`, `802`…)
  - `20..37` (18): Số quay / Số bị gọi (tự động loại tiền tố `9` khi gọi ra ngoài)
  - `38..52` (15): Số chủ gọi
  - `53..60` (8): Account Code
  - `61..64` (4): Trunk Group
  - `65..69` (5): Primary Station / Máy nhánh
  - `70..89` (20): UCID (20 ký tự hex)
- **`LEGACY` (54+ ký tự cố định — Avaya Definity / CM R1.x–R3.x)**:
  - `0..5` Date, `6..9` Time, `10..13` Duration (4 ký tự `MMMT`), `14` Condition Code, `15..18` TAC, `19..33` Dialed, `34..43` Calling, `44..49` Account Code, `50..53` Trunk Group.
- **`UNFORMATTED`**: Dòng phân tách bởi khoảng trắng (hỗ trợ stream tùy biến hoặc test nhanh).

Phân loại `call_type` tự động dựa trên Condition Code, độ dài máy nhánh nội bộ (3–5 chữ số) và Trunk/TAC:
- `ineffective`: Condition Code `4` (RNA), `7` (Busy), `8` (Abandoned), `B` (Restricted), `G` (Trunk Fail).
- `tandem`: Cuộc gọi trung chuyển Trunk-to-Trunk (`E`/`T` hoặc cả hai đầu là số ngoại mạng qua Trunk).
- `incoming`: Condition Code `9` hoặc số ngoài gọi vào máy nhánh nội bộ.
- `outgoing`: Máy nhánh nội bộ gọi ra số ngoại mạng.
- `internal`: Station-to-station nội bộ.

## 4. Cấu hình trên Avaya Aura Communication Manager (SAT)

Thực hiện trên giao diện quản trị SAT của Avaya CM active server:

1. **Khai báo IP của máy chủ Linux nhận CDR (`change node-names ip`)**:
   ```text
   Name: cdr-server
   IP Address: <IP_LINUX_SERVER>
   ```

2. **Khai báo dịch vụ CDR1 (`change ip-services`)**:
   ```text
   Service Type: CDR1
   Enabled: y
   Local Node: procr
   Local Port: 0
   Remote Node: cdr-server
   Remote Port: 5000
   ```
   *(Lưu ý: `Remote Port` phải trùng với `CDR_LISTEN_PORT` trong `.env`, mặc định `5000`. Mở firewall TCP port `5000` từ IP `procr`/CLAN của Avaya CM tới Linux server).*

3. **Kích hoạt xuất CDR (`change system-parameters cdr`)**:
   ```text
   CDR Date Format: month/day
   Primary Output Format: unformatted
   Primary Output Endpoint: CDR1
   Record Outgoing Calls only? n
   Intra-switch CDR? y
   Record Called Vector Directory Number? y
   Inc Trk Call Splitting? y
   Outg Trk Call Splitting? y
   ```

## 5. Cài đặt & Vận hành

### Chạy Local / Development
1. Tạo tệp `.env` từ `.env.example` và điền thông số PostgreSQL (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`) cùng `CDR_LISTEN_PORT=5000`, `CDR_FORMAT_PROFILE=CM4PLUS`.
2. Cài đặt thư viện và đẩy schema PostgreSQL:
   ```bash
   npm install
   npx drizzle-kit push --config=src/db/drizzle.config.ts
   # Hoặc chạy file SQL thuần trên Linux PostgreSQL:
   # psql -h <host> -U <admin> -d <db> -f migrations/001_create_cdr_records.sql
   ```
3. Chạy unit test cho `CdrParser`:
   ```bash
   node --test server/cdrParser.test.ts
   ```
4. Khởi động ứng dụng (Web Server port `3000` + CDR TCP Listener port `5000`):
   ```bash
   npm run dev
   ```
5. Kiểm thử gửi gói CDR thật qua TCP bằng `nc` (Netcat) trên Linux:
   ```bash
   echo "1112260915000359801 3001              0903451289     AC1001  00013001 00001000011731458290" | nc -w 1 127.0.0.1 5000
   ```

### Chạy Production trên Linux (Systemd hoặc Docker)
- **Với Systemd**:
  ```bash
  npm run build
  sudo cp deploy/avaya-cdr.service /etc/systemd/system/avaya-cdr.service
  sudo systemctl daemon-reload
  sudo systemctl enable --now avaya-cdr
  sudo journalctl -u avaya-cdr -f
  ```
- **Với Docker**:
  ```bash
  docker build -t avaya-cdr-monitor .
  docker run -d --name avaya-cdr -p 3000:3000 -p 5000:5000 --env-file .env -v $(pwd)/logs:/app/logs avaya-cdr-monitor
  ```

## 6. Danh sách REST API

Tất cả endpoint `/api/cdr*` yêu cầu `Authorization: Bearer <Firebase_ID_Token>`:
- `GET /api/cdr` — Lọc theo `from`, `to`, `calling_number`, `called_number`, `trunk_group`, `call_type`, `page`, `page_size`, `sortBy`, `sortDir`.
- `GET /api/cdr/:id` — Lấy chi tiết bản ghi CDR bao gồm `rawRecord`.
- `GET /api/cdr/export` — Xuất CSV theo bộ lọc hiện tại.
- `POST /api/cdr/test-tcp` — Gửi 1 bản tin CDR mẫu qua TCP socket tới chính `CDR_LISTEN_PORT`.
- `POST /api/cdr/import` — Kiểm tra (`dryRun: true`) hoặc nạp các dòng CDR thô.
- `POST /api/cdr/seed` — Tạo 10 bản ghi CDR mẫu vào PostgreSQL.
