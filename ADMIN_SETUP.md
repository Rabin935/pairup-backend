# Admin System Documentation

## Overview
The admin system allows only users with `role: "admin"` to access admin endpoints and view all user credentials.

## Features
- ✅ Admin-only login endpoint
- ✅ View all users and their credentials
- ✅ View individual user details
- ✅ Create new users
- ✅ Update user information
- ✅ Delete users
- ✅ Protected routes with authorization middleware

## Creating an Admin Account

### Method 1: Using the Seed Script
Run the provided seed script to create an initial admin account:

```bash
npx ts-node src/seeds/createAdmin.ts
```

**Default Credentials:**
- Email: `admin@pairup.com`
- Password: `Admin@123`

### Method 2: Manual Creation
Insert directly into MongoDB:

```javascript
db.users.insertOne({
  uid: "unique-uuid-here",
  firstname: "Admin",
  lastname: "User",
  email: "admin@pairup.com",
  number: "9999999999",
  password: "$2a$10$...", // bcrypt hashed password
  authProvider: "local",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date()
})
```

## API Endpoints

### Admin Login
```
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@pairup.com",
  "password": "Admin@123"
}
```

**Response:**
```json
{
  "success": true,
  "data": { /* admin user object */ },
  "token": "jwt-token",
  "message": "Admin login successful"
}
```

### Get All Users (Admin Only)
```
GET /api/admin/users
Authorization: Bearer <admin-jwt-token>
```

**Response:**
```json
{
  "success": true,
  "data": [ /* array of all users with credentials */ ],
  "count": 5,
  "message": "Users retrieved successfully"
}
```

### Get User by ID (Admin Only)
```
GET /api/admin/users/:id
Authorization: Bearer <admin-jwt-token>
```

### Create User (Admin Only)
```
POST /api/admin/users
Authorization: Bearer <admin-jwt-token>
Content-Type: multipart/form-data

{
  "firstname": "John",
  "lastname": "Doe",
  "email": "john@example.com",
  "number": "1234567890",
  "password": "password123",
  "authProvider": "local",
  "role": "user",
  "image": <file>
}
```

### Update User (Admin Only)
```
PUT /api/admin/users/:id
Authorization: Bearer <admin-jwt-token>
Content-Type: multipart/form-data

{
  "firstname": "Updated",
  "lastname": "Name",
  "image": <file> (optional)
}
```

### Delete User (Admin Only)
```
DELETE /api/admin/users/:id
Authorization: Bearer <admin-jwt-token>
```

## Security Features

### 1. Authorization Middleware
- Only users with `role: "admin"` can access admin routes
- Regular users get a 403 Forbidden error

### 2. Admin Middleware
- Additional layer of protection to verify admin status
- Checks if `req.user.role === "admin"`

### 3. JWT Authentication
- Admin token expires in 30 days
- Token contains: id, email, firstname, lastname, role

## How It Works

### User Registration Flow
1. User registers with regular endpoint: `POST /api/auth/register`
2. User gets `role: "user"` by default
3. User has `uid` auto-generated

### Admin Login Flow
1. Admin logs in via: `POST /api/admin/login`
2. System checks if email exists
3. System verifies user has `role: "admin"`
4. System validates password
5. JWT token is generated
6. Admin can now access protected routes

### Accessing User Data
1. Admin makes request to `/api/admin/users` with token
2. `authorizedMiddleware` verifies token and extracts user data
3. `isAdmin` middleware checks if user role is "admin"
4. Controller returns all users with complete credentials

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   Admin Login                           │
│  POST /api/admin/login                                  │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ Verify Email       │
        │ Verify Role=admin  │
        │ Verify Password    │
        └────────┬───────────┘
                 │
                 ▼
        ┌────────────────────┐
        │ Generate JWT       │
        │ Return Token       │
        └────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────────────────┐
    │ Use Token for Protected Routes     │
    │ /api/admin/users                   │
    │ /api/admin/users/:id               │
    │ etc...                             │
    └────────────────────────────────────┘
```

## Error Responses

### Unauthorized (401)
```json
{
  "success": false,
  "message": "Not authenticated"
}
```

### Forbidden (403)
```json
{
  "success": false,
  "message": "Admin access only"
}
```

### User Not Found (404)
```json
{
  "success": false,
  "message": "User not found"
}
```

## Important Notes

⚠️ **Security Reminders:**
1. Change default admin password immediately after creation
2. Never share admin credentials
3. Use HTTPS in production
4. Regularly audit admin access logs
5. Consider implementing role-based access control (RBAC) for different admin levels

## Testing with Postman/Curl

### 1. Create Admin Account
```bash
npx ts-node src/seeds/createAdmin.ts
```

### 2. Login as Admin
```bash
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@pairup.com","password":"Admin@123"}'
```

### 3. Get All Users
```bash
curl -X GET http://localhost:3000/api/admin/users \
  -H "Authorization: Bearer <your-jwt-token>"
```

## File Structure
```
src/
├── controllers/
│   └── admin/
│       └── admin.controller.ts    # Admin endpoints
├── services/
│   └── admin.service.ts           # Admin business logic
├── routes/
│   └── admin/
│       └── admin.route.ts         # Admin routes
├── middleware/
│   └── admin/
│       └── admin.middleware.ts    # Admin verification
└── seeds/
    └── createAdmin.ts            # Create initial admin
```

## Troubleshooting

### "Only admins can login here"
- The user account doesn't have `role: "admin"`
- Contact database admin to update the role field

### "Admin access only"
- Your token is not from an admin account
- Re-login with admin credentials

### "Not authenticated"
- JWT token is missing or invalid
- Include `Authorization: Bearer <token>` header
