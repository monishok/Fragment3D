// API Configuration
// Change this to your deployed backend URL when ready
export const API_BASE_URL = "http://localhost:5000/api";

export const API_ENDPOINTS = {
  login: `${API_BASE_URL}/auth/login`,
  register: `${API_BASE_URL}/auth/register`,
  assets: `${API_BASE_URL}/assets`,
  create: `${API_BASE_URL}/create`,
};
