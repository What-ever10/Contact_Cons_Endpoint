-> Contact Management & Identity Consolidation Service- 
This service implements the Bitespeed `/identify` endpoint to consolidate customer contacts across multiple purchases.
It links contacts using shared email or phone number and maintains a primary-secondary relationship structure.

---
-> Live Endpoint- 
Identify Endpoint: https://contact-cons-endpoint.onrender.com/identify
Base URL: https://contact-cons-endpoint.onrender.com/

---
-> Request Format- 
Send a **POST** request to `/identify` with JSON with the content:
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}
Atleast one of the two should be present in the request body.
