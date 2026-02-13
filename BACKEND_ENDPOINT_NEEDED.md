# ✅ Backend API Endpoint Created!

## Endpoint Details

### GET /api/corporates/{corporate_id}/employees

**Description:** Fetch all employees for a specific corporate

**URL Pattern:** 
```
GET http://localhost:3000/api/corporates/{corporate_id}/employees
```

**Example:**
```
GET http://localhost:3000/api/corporates/8a6d0136-6566-4703-ac69-c59217302c56/employees
```

**Status:** ✅ **Already Created** at `app/api/corporates/[corporateId]/employees/route.ts`

---

## Expected Response Format

### Success Response (200 OK)

```json
{
  "employees": [
    {
      "user_id": "uuid-string",
      "name": "John Doe",
      "email": "john.doe@company.com",
      "phone": "+91 9876543210",
      "department": "Engineering",
      "designation": "Senior Developer",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "user_id": "uuid-string",
      "name": "Jane Smith",
      "email": "jane.smith@company.com",
      "phone": "+91 9876543211",
      "department": "Marketing",
      "designation": "Marketing Manager",
      "created_at": "2024-02-20T14:20:00Z"
    }
  ]
}
```

### Error Response (404 Not Found)

```json
{
  "error": "Corporate not found"
}
```

---

## Backend Implementation Example (Python FastAPI)

```python
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
import uuid

router = APIRouter()

@router.get("/api/corporates/{corporate_id}/employees")
async def get_corporate_employees(corporate_id: str):
    """
    Get all employees for a specific corporate
    """
    try:
        # Validate UUID
        corporate_uuid = uuid.UUID(corporate_id)
        
        # TODO: Replace with your actual database query
        # Example query (adjust based on your database):
        # 
        # SELECT 
        #   e.user_id,
        #   e.name,
        #   e.email,
        #   e.phone,
        #   e.department,
        #   e.designation,
        #   e.created_at
        # FROM corporates c
        # INNER JOIN corporate_employees ce ON c.id = ce.corporate_id
        # INNER JOIN employees e ON ce.employee_id = e.id
        # WHERE c.id = corporate_uuid
        
        # For Supabase (example):
        from supabase import create_client
        
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Get corporate record
        corporate_response = supabase.table('corporates')\
            .select('employees')\
            .eq('id', str(corporate_uuid))\
            .single()\
            .execute()
        
        if not corporate_response.data:
            raise HTTPException(status_code=404, detail="Corporate not found")
        
        # Return employees array from JSONB column
        employees = corporate_response.data.get('employees', [])
        
        return {
            "employees": employees
        }
        
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid corporate ID format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch employees: {str(e)}")
```

---

## Alternative: Using Supabase Directly (If you have the schema)

If your `corporates` table has a JSONB column called `employees`, you can query it directly:

```python
@router.get("/api/corporates/{corporate_id}/employees")
async def get_corporate_employees(corporate_id: str):
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        response = supabase.table('corporates')\
            .select('employees')\
            .eq('id', corporate_id)\
            .single()\
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Corporate not found")
        
        return {
            "employees": response.data.get('employees', [])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Steps to Implement

1. **Create the endpoint** in your backend API (FastAPI, Express, etc.)
2. **Connect to your database** (Supabase, PostgreSQL, etc.)
3. **Query the corporate's employees** from the database
4. **Return the data** in the expected JSON format
5. **Test the endpoint** using curl or Postman:
   ```bash
   curl http://localhost:8000/api/corporates/8a6d0136-6566-4703-ac69-c59217302c56/employees
   ```

---

## CORS Configuration

Make sure your backend allows CORS requests from your Next.js frontend:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Your Next.js URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Database Schema Expected

Your database should have a structure like:

### Option 1: JSONB Column in corporates table

```sql
CREATE TABLE corporates (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    employees JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### Option 2: Separate employees table

```sql
CREATE TABLE employees (
    user_id UUID PRIMARY KEY,
    corporate_id UUID REFERENCES corporates(id),
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    department VARCHAR(100),
    designation VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
```
