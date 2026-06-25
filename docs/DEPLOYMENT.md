# Chatbot Widget - Deployment & Testing Guide

This guide outlines how to embed, test, and verify the Chatbot Widget both in your local development environment and on the staging server.

---

## 1. TESTING LOCALLY (localhost)

For local testing, the project runs a dual-container setup:
1. **`local-frontend`**: Serves the Chatbot Admin UI and hosts the widget loader script (`/widget.js`) at **`http://localhost:8081`**.
2. **`widget-test-site`**: A lightweight Nginx container serving a mockup JLU Gießen portal page at **`http://localhost:8082`**.

### Browser Links
* **Admin UI:** [http://localhost:8081](http://localhost:8081)
* **Widget Mock Portal:** [http://localhost:8082](http://localhost:8082)

### Quick Start
To start the local testing stack with live rebuilding:
```bash
docker compose up local-frontend widget-test-site -d --build
```

### Testing Steps
1. **Access the Mock Portal:** Open your browser and navigate to [http://localhost:8082](http://localhost:8082).
2. **Configure the Widget Teststeuerung Panel:** 
   * Confirm the **Widget Server Origin** is set to `http://localhost:8081` (your local frontend server).
   * Select a **Widget ID** (e.g., `support-bot` or `sales-tracker`).
   * Click **Widget neu laden** (Reload Widget). This dynamically injects the passive `div` placeholder and the global script loader into the DOM.
3. **Verify Widget Behavior:**
   * The floating action button (FAB) with the configured icon (e.g., a globe) should appear in the corner specified by the widget layout.
   * Click the FAB to open the chatbot window.
   * You should see a typing indicator followed by the greeting message.
   * Ask the bot mock questions (e.g., *"Was ist die JLU?"* or *"Semesterticket"*) to verify context-aware replies.
4. **Access the Admin Panel:** Manage and configure widgets at [http://localhost:8081](http://localhost:8081).

---

## 2. TESTING ON STAGING SERVER (sv90073.hrz.uni-giessen.de)

On the staging environment hosted at **`sv90073.hrz.uni-giessen.de`**, the widget script is served globally, allowing you to embed it on external test pages or mock CMS sites.

### Staging Architecture
* **Admin Frontend / Widget Script:** `https://sv90073.hrz.uni-giessen.de/widget.js`
* **Staging Test Site:** `https://sv90073.hrz.uni-giessen.de/test-widget/`

### Browser Links
* **Staging Admin UI:** [https://sv90073.hrz.uni-giessen.de](https://sv90073.hrz.uni-giessen.de)
* **Staging Widget Mock Portal:** [https://sv90073.hrz.uni-giessen.de/test-widget/](https://sv90073.hrz.uni-giessen.de/test-widget/)

### Running the Stack on Staging
1. SSH into the staging server:
   ```bash
   ssh user@sv90073.hrz.uni-giessen.de
   ```
2. Navigate to your project directory and pull the latest production images from the GitHub Container Registry:
   ```bash
   docker compose pull
   ```
3. Run the container services in background mode:
   ```bash
   docker compose up -d
   ```
   *This starts the `chatbotadmin-frontend` on host port `443` (SSL, which also serves the mock test site securely under `/test-widget/`).*

### Embedding the Widget on Staging Pages
To test the widget on staging CMS environments or static staging portals:

1. **Add the HTML Placeholder Container:**
   Paste the following passive `<div>` container into the page content (e.g., via rich text editor or raw HTML block). Editors do not need to paste script tags here:
   ```html
   <div class="chatbot-widget"
        data-widget-id="support-bot"
        data-kb="jlu-staging-2026"
        data-routing="public-widget"
        data-lang="de"></div>
   ```
2. **Include the Global Loader Script:**
   Include the widget script **once globally** in the staging portal's main theme (e.g., in the `<head>` or before `</body>`):
   ```html
   <script src="https://sv90073.hrz.uni-giessen.de/widget.js" defer></script>
   ```

## 3. SSL CONFIGURATION ON STAGING

To configure SSL on the staging server using your certificate files:
* **Private Key:** `/etc/ssl/private/priv.pem`
* **Certificate:** `/etc/ssl/certs/sv90073.pem`

You can configure the Nginx web server inside the Docker container to handle SSL termination directly. We have created a staging Nginx config file [nginx.staging.conf](file:///Users/stenseegel/gitHub/chatbotadmin-frontend/nginx.staging.conf) in the project.

1. **Update `docker-compose.yml` on Staging:**
   Modify the `chatbotadmin-frontend` service to mount your SSL certificates, mount the staging Nginx configuration, and map the SSL ports (default is port 443 for HTTPS and port 80 for HTTP redirects):
   ```yaml
     chatbotadmin-frontend:
       image: ghcr.io/stenseegel/chatbotadmin-frontend:latest
       container_name: chatbotadmin-frontend
       ports:
         - "443:443"             # Maps host port 443 to container HTTPS port 443
         - "80:80"               # Maps host port 80 to container HTTP port 80 (for redirects)
       volumes:
         # Mount host certificates into container Nginx SSL folder
         - /etc/ssl/certs/sv90073.pem:/etc/nginx/ssl/sv90073.pem:ro
         - /etc/ssl/private/priv.pem:/etc/nginx/ssl/priv.pem:ro
         # Override default nginx config with staging configuration
         - ./nginx.staging.conf:/etc/nginx/conf.d/default.conf:ro
       restart: always
   ```
2. **Access Staging UI:** 
   Once restarted (`docker compose up -d`), you can access the secure site at:
   * **Staging Admin UI:** [https://sv90073.hrz.uni-giessen.de](https://sv90073.hrz.uni-giessen.de)
   * **Staging Widget Script:** `https://sv90073.hrz.uni-giessen.de/widget.js`

> [!NOTE]
> **Do we need the port in the staging URL?**
> * **Using Port 443:** If you bind to the default HTTPS port (`"443:443"`), **you do not need the port in the URL** (e.g. `https://sv90073.hrz.uni-giessen.de/widget.js`).
> * **Alternative Port 442:** If port `443` is already in use by another service on the host, change the ports mapping to `"442:443"`. In that case, **you must specify the port** in your URLs (e.g. `https://sv90073.hrz.uni-giessen.de:442/widget.js`).



## 4. STAGING CORS CONFIGURATION
If the staging widget executes backend API calls (e.g. to a backend container), the backend must respond with proper CORS headers allowing your staging origin:
```http
Access-Control-Allow-Origin: https://sv90073.hrz.uni-giessen.de
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

