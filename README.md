# EduTrack SaaS Project

This project contains the complete source code for the EduTrack SaaS platform, divided into a Python backend and a React frontend.

## Project Structure

```
SCHOOL/
├── backend/            # FastAPI Python backend
│   ├── app/            # Source code
│   └── requirements.txt
├── frontend/           # React (Vite) frontend
│   ├── src/            # Source code
│   └── package.json
├── .gitignore
└── README.md
```

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment:
   ```bash
   python -m venv .venv
   ```

3. Activate the virtual environment:
   - On macOS/Linux: `source .venv/bin/activate`
   - On Windows: `.venv\Scripts\activate`

4. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```

5. Run the FastAPI server:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
