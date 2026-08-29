const resources = {
  profile: { label: "Profile", icon: "fa-user", endpoint: "profiles", permission: "profile", singleton: true, fields: [["name", "Name"], ["greeting", "Greeting"], ["bio", "Bio", "textarea"], ["background_url", "Hero background image", "text", "upload"], ["photo_url", "Profile image", "text", "upload"], ["resume_url", "Resume URL"]] },
  skills: { label: "Skills", icon: "fa-bolt", endpoint: "skills", fields: [["category", "Category"], ["details", "Description", "textarea"], ["sort_order", "Order", "number"], ["is_active", "Active", "checkbox"]] },
  experiences: { label: "Experience", icon: "fa-briefcase", endpoint: "experiences", permission: "experience", fields: [["company", "Company"], ["duration", "Duration"], ["role", "Role"], ["project", "Project"], ["logo_url", "Logo URL", "text", "upload"], ["sort_order", "Order", "number"], ["is_active", "Active", "checkbox"]] },
  projects: { label: "Projects", icon: "fa-folder-open", endpoint: "projects", fields: [["name", "Name"], ["description", "Description", "textarea"], ["logo_url", "Project image URL", "text", "upload"], ["project_url", "Live URL"], ["sort_order", "Order", "number"], ["is_active", "Active", "checkbox"]] },
  homepage: { label: "Homepage", icon: "fa-house", endpoint: "settings", settingsGroup: "home", fields: [["key", "Setting key"], ["value", "Value", "textarea"], ["is_active", "Active", "checkbox"]] },
  "social-links": { label: "Social Links", icon: "fa-link", endpoint: "social-links", permission: "social", fields: [["label", "Label"], ["url", "URL"], ["icon", "Icon class"], ["placement", "Placement"], ["sort_order", "Order", "number"], ["is_active", "Active", "checkbox"]] },
  footer: { label: "Footer", icon: "fa-pen-to-square", endpoint: "settings", settingsGroup: "footer", fields: [["key", "Setting key"], ["value", "Value", "textarea"], ["is_active", "Active", "checkbox"]] },
  settings: { label: "Settings", icon: "fa-sliders", endpoint: "settings", fields: [["key", "Key"], ["value", "Value"], ["is_active", "Active", "checkbox"]] },
  resume: { label: "Resume", icon: "fa-file-pdf", endpoint: "profiles", resume: true, fields: [] },
  media: { label: "Media", icon: "fa-images", endpoint: "media", upload: true, fields: [] },
  "admin-users": { label: "Admin Users", icon: "fa-users", endpoint: "users", users: true, fields: [] },
  "audit-logs": { label: "Audit Logs", icon: "fa-clipboard-list", endpoint: "audit-logs", audit: true, fields: [] },
  "change-password": { label: "Change Password", icon: "fa-key", endpoint: "change-password", password: true, fields: [] }
};
let current = "dashboard";
let currentAdmin = null;
let auditLogPage = 1;
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const permissionName = (config, action) => {
  if (config.users) return `users.${action}`;
  if (config.audit) return "audit.read";
  if (config.password) return "security.password";
  if (config.settingsGroup) return `${config.settingsGroup === "home" ? "homepage" : "footer"}.${action}`;
  return `${config.permission || (config.resume ? "resume" : config.endpoint)}.${action}`;
};
const can = (config, action) => (currentAdmin?.permissions || []).includes(permissionName(config, action));
function confirmAction(message, title = "Please confirm") {
  return new Promise((resolve) => {
    const root = $("#dialog-root");
    root.innerHTML = `<div class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="dialog-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><h2 id="dialog-title">${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div><div class="dialog-actions"><button type="button" class="small-button dialog-cancel">Cancel</button><button type="button" class="primary-button dialog-confirm">Continue</button></div></section></div>`;
    root.classList.add("open");
    const close = (value) => { root.classList.remove("open"); root.innerHTML = ""; resolve(value); };
    root.querySelector(".dialog-cancel").addEventListener("click", () => close(false));
    root.querySelector(".dialog-confirm").addEventListener("click", () => close(true));
    root.querySelector(".dialog-backdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) close(false); });
    root.querySelector(".dialog-confirm").focus();
  });
}
function actionMenu(actions) {
  if (!actions.length) return "—";
  return `<div class="action-menu"><button class="icon-button more-button" type="button" aria-label="More actions" title="More actions" aria-expanded="false"><i class="fa-solid fa-ellipsis"></i></button><div class="action-menu-list" role="menu">${actions.join("")}</div></div>`;
}
const api = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`/api/admin/${path}`, { credentials: "same-origin", ...options });
  } catch (error) {
    throw new Error("Unable to connect to the portfolio server. Start it with `npm start` and try again.");
  }
  const data = response.status === 204 ? null : await response.json();
  if (response.status === 401 && path !== "login") { showLogin(); throw new Error("Your session has expired."); }
  if (!response.ok) throw new Error(data?.error || "Request failed.");
  return data;
};
function showLogin() { $("#login-view").classList.remove("d-none"); $("#app-view").classList.add("d-none"); }
function flash(message, type = "success") { const box = $("#flash"); box.textContent = message; box.className = `alert ${type}`; }
function setPage(name) {
  current = name;
  const title = name === "dashboard" ? "Dashboard" : resources[name].label;
  $("#page-title").textContent = title;
  $("#breadcrumb").textContent = `Workspace / ${title}`;
  document.querySelectorAll(".sidebar-link[data-resource]").forEach((link) => link.classList.toggle("active", link.dataset.resource === name));
  $("#sidebar").classList.remove("open"); $("#sidebar-backdrop").classList.remove("open");
}
function fieldMarkup(field, value = "") {
  const [name, label, type = "text"] = field;
  if (type === "checkbox") return `<label class="check-field"><input name="${name}" type="checkbox" ${value ? "checked" : ""}><span>${label}</span></label>`;
  if (field[3] === "upload") {
    const preview = value ? `<img class="image-field-preview" src="${escapeHtml(value)}" alt="Current ${escapeHtml(label)}" onerror="this.classList.add('is-empty')">` : `<span class="image-field-preview is-empty"><i class="fa-regular fa-image"></i></span>`;
    return `<label class="image-field-label">${label}<span class="field-help">Upload an image or paste a URL</span><div class="image-field">${preview}<div class="image-field-body"><input name="${name}" type="text" value="${escapeHtml(value)}" placeholder="Paste image URL" required><span class="upload-inline"><input class="field-upload" type="file" accept="image/jpeg,image/png,image/webp"><i class="fa-solid fa-upload"></i> Choose image</span></div></div></label>`;
  }
  return `<label>${label}<div class="field-with-upload">${type === "textarea" ? `<textarea name="${name}" rows="3">${escapeHtml(value)}</textarea>` : `<input name="${name}" type="${type}" value="${escapeHtml(value)}" required>`}</div></label>`;
}
function formMarkup(config, item = {}) {
  const itemId = config.endpoint === "settings" ? item.key : item.id;
  return can(config, itemId ? "update" : (config.singleton ? "update" : "create")) ? `<form class="editor-form" data-id="${escapeHtml(itemId || "")}">${config.fields.map((field) => fieldMarkup(field, item[field[0]])).join("")}<button class="primary-button" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save changes</button></form>` : "";
}
function itemTitle(config, item) { return item.name || item.category || item.label || item.filename || item.key || item.company || item.responsibility || "Untitled item"; }
function itemMeta(config, item) {
  const status = Object.prototype.hasOwnProperty.call(item, "is_active") ? `<span class="status-badge ${item.is_active ? "" : "inactive"}">${item.is_active ? "Active" : "Inactive"}</span>` : "";
  const detail = item.description || item.value || item.url || item.role || item.details || (item.mime_type ? `${item.mime_type} · ${Math.ceil(item.size / 1024)} KB` : "");
  return `${status}${detail ? ` <span>${escapeHtml(detail).slice(0, 100)}</span>` : ""}`;
}
function listMarkup(config, items) {
  if (!items.length) return `<div class="empty-state"><i class="fa-regular fa-folder-open"></i><p>No ${config.label.toLowerCase()} found yet.</p></div>`;
  return `<div class="item-list">${items.map((item) => `<div class="item-row"><div>${config.upload && item.mime_type?.startsWith("image/") ? `<img class="media-preview" src="${escapeHtml(item.url)}" alt="">` : ""}<div class="item-title">${escapeHtml(itemTitle(config, item))}</div><div class="item-meta">${itemMeta(config, item)}${config.upload && item.usage?.length ? `<div>Used by: ${escapeHtml(item.usage.join(", "))}</div>` : ""}</div></div><div class="item-actions">${actionMenu(config.upload ? [`<button class="copy-media" data-url="${escapeHtml(item.url)}" type="button" role="menuitem"><i class="fa-regular fa-copy"></i> Copy URL</button>`,...(can(config, "replace") ? [`<button class="replace-media" data-id="${item.id}" type="button" role="menuitem"><i class="fa-solid fa-arrows-rotate"></i> Replace</button>`] : [])] : [...(can(config, item.id || item.key ? "update" : "create") ? [`<button class="edit-item" data-item="${escapeHtml(JSON.stringify(item))}" type="button" role="menuitem"><i class="fa-solid fa-pen"></i> Edit</button>`] : []),...(can(config, "delete") ? [`<button class="danger delete-item" data-id="${escapeHtml(item.id || item.key)}" type="button" role="menuitem"><i class="fa-solid fa-trash"></i> Delete</button>`] : [])])}</div></div>`).join("")}</div>`;
}
async function loadDashboard() {
  setPage("dashboard");
  $("#resource-panel").innerHTML = `<div class="section-heading"><div><h2>Good to see you.</h2><p>Manage your portfolio content from one place.</p></div></div><div class="stats-grid"><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-bolt"></i></div><strong id="stat-skills">—</strong><span>Total skills</span></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-briefcase"></i></div><strong id="stat-experiences">—</strong><span>Total experiences</span></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-folder-open"></i></div><strong id="stat-projects">—</strong><span>Total projects</span></div><div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-images"></i></div><strong id="stat-media">—</strong><span>Total media</span></div></div><div class="section-heading"><div><h2>Quick actions</h2><p>Jump directly to a common task.</p></div></div><div class="quick-grid"><a class="quick-card" href="#skills" data-quick="skills"><i class="fa-solid fa-plus"></i> Add skill</a><a class="quick-card" href="#experiences" data-quick="experiences"><i class="fa-solid fa-plus"></i> Add experience</a><a class="quick-card" href="#projects" data-quick="projects"><i class="fa-solid fa-plus"></i> Add project</a><a class="quick-card" href="#media" data-quick="media"><i class="fa-solid fa-upload"></i> Upload media</a><a class="quick-card" href="#profile" data-quick="profile"><i class="fa-solid fa-user-pen"></i> Edit profile</a></div>`;
  const counts = await Promise.all(["skills", "experiences", "projects", "media"].map((name) => api(resources[name].endpoint)));
  ["skills", "experiences", "projects", "media"].forEach((name, index) => { $(`#stat-${name}`).textContent = counts[index].length; });
  const summary = await api("dashboard");
  $("#resource-panel .stats-grid").insertAdjacentHTML("beforeend", `<div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div><strong>${summary.counts.admin_users}</strong><span>Admin users</span></div>`);
  $("#resource-panel").insertAdjacentHTML("beforeend", `<div class="dashboard-details"><div class="resource-card"><div class="resource-card-header"><div><h2>System status</h2><p>Operational checks without exposing secrets.</p></div></div><div class="status-grid"><span>Database <strong>${escapeHtml(summary.health.database)}</strong></span><span>API <strong>${escapeHtml(summary.health.api)}</strong></span><span>Media storage <strong>${escapeHtml(summary.health.mediaStorage)}</strong></span><span>Authentication <strong>${escapeHtml(summary.health.authentication)}</strong></span></div></div><div class="resource-card"><div class="resource-card-header"><div><h2>Recent activity</h2><p>Latest administrator and content events.</p></div></div><div class="item-list">${summary.recentActivity.length ? summary.recentActivity.map((entry) => `<div class="item-row"><div><div class="item-title">${escapeHtml(entry.action)}</div><div class="item-meta">${escapeHtml(entry.resource_type || "System")} · ${escapeHtml(new Date(entry.created_at).toLocaleString())}</div></div></div>`).join("") : '<div class="empty-state">No activity yet.</div>'}</div></div></div>`);
  document.querySelectorAll("[data-quick]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); loadResource(link.dataset.quick); }));
}
async function renderUsers() {
  const canManage = currentAdmin?.role === "super_admin";
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>Admin Users</h2><p>Manage administrator access without exposing credentials.</p></div>${canManage ? '<button class="primary-button add-user" type="button"><i class="fa-solid fa-plus"></i> Add user</button>' : ""}</div><div class="users-toolbar"><input id="user-search" placeholder="Search name or email" aria-label="Search admin users"></div><div class="table-wrap"><table class="management-table"><thead><tr><th>Name / Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Created</th><th>Actions</th></tr></thead><tbody><tr><td colspan="6" class="loading-state">Loading...</td></tr></tbody></table></div></div>`;
  try {
    const result = await api(`users?search=${encodeURIComponent($("#user-search").value)}`); const rows = result.users || [];
    const tbody = $(".management-table tbody");
    tbody.innerHTML = rows.length ? rows.map((user) => `<tr><td><strong>${escapeHtml(user.full_name || "Unnamed")}</strong><br><span class="muted">${escapeHtml(user.email)}</span></td><td><span class="role-badge">${escapeHtml(user.role.replace("_", " "))}</span></td><td><span class="status-badge ${user.status === "active" ? "" : "inactive"}">${escapeHtml(user.status)}</span></td><td>${escapeHtml(user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never")}</td><td>${escapeHtml(new Date(user.created_at).toLocaleDateString())}</td><td>${canManage ? actionMenu([`<button class="edit-user" data-user="${escapeHtml(JSON.stringify(user))}" type="button" role="menuitem"><i class="fa-solid fa-pen"></i> Edit</button>`,`<button class="reset-user" data-id="${user.id}" type="button" role="menuitem"><i class="fa-solid fa-key"></i> Reset password</button>`,`<button class="delete-user danger" data-id="${user.id}" type="button" role="menuitem"><i class="fa-solid fa-trash"></i> Delete</button>`]) : "—"}</td></tr>`).join("") : '<tr><td colspan="6" class="empty-state">No admin users found.</td></tr>';
    $(".add-user")?.addEventListener("click", () => showUserForm());
    $("#user-search").addEventListener("input", () => renderUsers());
    document.querySelectorAll(".edit-user").forEach((button) => button.addEventListener("click", () => showUserForm(JSON.parse(button.dataset.user))));
    document.querySelectorAll(".delete-user").forEach((button) => button.addEventListener("click", async () => { if (!await confirmAction("This admin user will permanently lose access.", "Delete admin user?")) return; try { await api(`users/${button.dataset.id}`, { method: "DELETE" }); flash("Admin user deleted."); renderUsers(); } catch (error) { flash(error.message, "error"); } }));
    document.querySelectorAll(".reset-user").forEach((button) => button.addEventListener("click", async () => { if (!await confirmAction("A password recovery email will be sent to this user.", "Reset password?")) return; try { const result = await api(`users/${button.dataset.id}/reset-password`, { method: "POST" }); flash(result.message); } catch (error) { flash(error.message, "error"); } }));
  } catch (error) { flash(error.message, "error"); }
}
function showUserForm(user = {}) {
  $("#user-editor")?.remove();
  $("#resource-panel .resource-card").insertAdjacentHTML("afterbegin", `<form id="user-editor" class="editor-form"><h3>${user.id ? "Edit admin user" : "Create admin user"}</h3><label>Full name<input name="full_name" value="${escapeHtml(user.full_name || "")}" required></label><label>Email<input name="email" type="email" value="${escapeHtml(user.email || "")}" required></label>${user.id ? "" : '<label>Temporary password<input name="password" type="password" minlength="12" required autocomplete="new-password"></label>'}<label>Role<select name="role"><option value="super_admin" ${user.role === "super_admin" ? "selected" : ""}>Super Admin</option><option value="editor" ${user.role === "editor" ? "selected" : ""}>Editor</option><option value="viewer" ${user.role === "viewer" ? "selected" : ""}>Viewer</option></select></label><label>Status<select name="status"><option value="active" ${user.status !== "inactive" ? "selected" : ""}>Active</option><option value="inactive" ${user.status === "inactive" ? "selected" : ""}>Inactive</option></select></label><button class="primary-button" type="submit">Save user</button></form>`);
  $("#user-editor").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.target; const body = Object.fromEntries(new FormData(form).entries()); if (!body.password) delete body.password; try { await api(user.id ? `users/${user.id}` : "users", { method: user.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); flash("Admin user saved."); renderUsers(); } catch (error) { flash(error.message, "error"); } });
}
function renderChangePassword() {
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>Change Password</h2><p>Use a unique password with at least 12 characters, upper/lowercase letters, and a number.</p></div></div><form id="change-password-form" class="editor-form"><label>Current password<input name="current_password" type="password" autocomplete="current-password" required></label><label>New password<input name="new_password" type="password" minlength="12" autocomplete="new-password" required></label><label>Confirm new password<input name="confirm_password" type="password" minlength="12" autocomplete="new-password" required></label><button class="primary-button" type="submit">Change password</button></form></div>`;
  $("#change-password-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await api("change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) }); flash("Password changed. Other sessions were signed out."); event.target.reset(); } catch (error) { flash(error.message, "error"); } });
}
async function renderAuditLogs() {
  const page = auditLogPage;
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>Audit Logs</h2><p>Security and content changes are recorded without passwords or tokens.</p></div></div><div class="table-wrap"><table class="management-table"><thead><tr><th>Action</th><th>Resource</th><th>IP</th><th>When</th></tr></thead><tbody><tr><td colspan="4" class="loading-state">Loading...</td></tr></tbody></table></div><div class="pagination-controls" aria-label="Audit log pages"></div></div>`;
  try {
    const result = await api(`audit-logs?page=${page}&limit=10`);
    const logs = Array.isArray(result) ? result : (result.logs || []);
    $(".management-table tbody").innerHTML = logs.length ? logs.map((log) => `<tr><td><strong>${escapeHtml(log.action)}</strong></td><td>${escapeHtml(`${log.resource_type || ""} ${log.resource_id || ""}`)}</td><td>${escapeHtml(log.ip_address || "—")}</td><td>${escapeHtml(new Date(log.created_at).toLocaleString())}</td></tr>`).join("") : '<tr><td colspan="4" class="empty-state">No activity recorded yet.</td></tr>';
    const pagination = result.pagination || { page, pages: logs.length === 10 ? page + 1 : page, total: logs.length };
    $(".pagination-controls").innerHTML = `<button class="small-button" type="button" ${pagination.page <= 1 ? "disabled" : ""} data-audit-page="${pagination.page - 1}">Previous</button><span>Page ${pagination.page} of ${pagination.pages || 1}</span><button class="small-button" type="button" ${pagination.page >= (pagination.pages || 1) ? "disabled" : ""} data-audit-page="${pagination.page + 1}">Next</button>`;
    document.querySelectorAll("[data-audit-page]").forEach((button) => button.addEventListener("click", () => { auditLogPage = Number(button.dataset.auditPage); renderAuditLogs(); }));
  } catch (error) { flash(error.message, "error"); }
}
async function loadResource(name = current) {
  current = name; const config = resources[name]; setPage(name);
  if (config.users) return renderUsers();
  if (config.audit) return renderAuditLogs();
  if (config.password) return renderChangePassword();
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>${config.label}</h2><p>Manage your ${config.label.toLowerCase()} content.</p></div>${config.upload && can(config, "upload") ? `<label class="primary-button upload-button"><i class="fa-solid fa-upload"></i> Upload<input id="media-upload" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>` : ""}</div><div class="loading-state">Loading...</div></div>`;
  try {
     const result = await api(`${config.endpoint}${config.settingsGroup ? `?group=${config.settingsGroup}` : ""}`); const items = config.singleton ? (Array.isArray(result) ? result : [result]).filter(Boolean) : result;
    if (config.resume) return renderResume(items[0]);
    if (config.settingsGroup) {
      const prefixes = config.settingsGroup === "home" ? ["navbar_", "homepage_"] : ["contact_", "follow_", "copyright_"];
      const filtered = items.filter((item) => prefixes.some((prefix) => item.key.startsWith(prefix)));
      return renderSettings(config, filtered);
    }
    if (name === "experiences") {
      const responsibilities = await api("responsibilities");
      return renderExperiences(config, items, responsibilities);
    }
    const editor = config.singleton ? formMarkup(config, items[0] || {}) : "";
    const action = config.upload && can(config, "upload") ? `<label class="primary-button upload-button"><i class="fa-solid fa-upload"></i> Upload<input id="media-upload" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"></label>` : config.singleton || !can(config, "create") ? "" : `<button class="primary-button add-item" type="button"><i class="fa-solid fa-plus"></i> Add ${config.label.replace(/s$/, "")}</button>`;
    const description = config.upload ? "Upload images and PDFs here, then use their generated URL in profile, experience, or project image fields." : `Manage your ${config.label.toLowerCase()} content.`;
    $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>${config.label}</h2><p>${description}</p></div>${action}</div>${editor}${listMarkup(config, items)}</div>`;
    bindEditor(config);
    $(".add-item")?.addEventListener("click", () => { $("#resource-panel .editor-form")?.remove(); $("#resource-panel .resource-card-header").insertAdjacentHTML("afterend", formMarkup(config)); bindEditor(config); });
    document.querySelectorAll(".edit-item").forEach((button) => button.addEventListener("click", () => { $("#resource-panel .editor-form")?.remove(); $("#resource-panel .resource-card-header").insertAdjacentHTML("afterend", formMarkup(config, JSON.parse(button.dataset.item))); bindEditor(config); }));
    document.querySelectorAll(".delete-item").forEach((button) => button.addEventListener("click", async () => { if (!await confirmAction("This item will be permanently deleted.", "Delete item?")) return; try { await api(`${config.endpoint}/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" }); flash("Item deleted."); loadResource(); } catch (error) { flash(error.message, "error"); } }));
    document.querySelectorAll(".copy-media").forEach((button) => button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.url);
        flash("Media URL copied.");
      } catch (error) {
        flash("Could not copy the media URL. Copy it from the item details instead.", "error");
      }
    }));
    document.querySelectorAll(".replace-media").forEach((button) => button.addEventListener("click", async () => {
      if (!await confirmAction("The existing file will be replaced and all references updated.", "Replace media file?")) return;
      const input = document.createElement("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp,application/pdf";
      input.addEventListener("change", async () => { const file = input.files[0]; if (!file) return; const body = new FormData(); body.append("file", file); try { await api(`media/${button.dataset.id}/replace`, { method: "POST", body }); flash("Media replaced and references updated."); loadResource("media"); } catch (error) { flash(error.message, "error"); } });
      input.click();
    }));
    $("#media-upload")?.addEventListener("change", uploadMedia);
  } catch (error) { flash(error.message, "error"); }
}
function renderSettings(config, items) {
  const add = can(config, "create") ? '<button class="primary-button add-item" type="button"><i class="fa-solid fa-plus"></i> Add setting</button>' : "";
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>${config.label}</h2><p>Manage ${config.label.toLowerCase()} content and labels.</p></div>${add}</div>${formMarkup(config)}${listMarkup(config, items)}</div>`;
  bindEditor(config);
  $(".add-item")?.addEventListener("click", () => { $("#resource-panel .editor-form")?.remove(); $("#resource-panel .resource-card-header").insertAdjacentHTML("afterend", formMarkup(config)); bindEditor(config); });
  document.querySelectorAll(".edit-item").forEach((button) => button.addEventListener("click", () => { $("#resource-panel .editor-form")?.remove(); $("#resource-panel .resource-card-header").insertAdjacentHTML("afterend", formMarkup(config, JSON.parse(button.dataset.item))); bindEditor(config); }));
  document.querySelectorAll(".delete-item").forEach((button) => button.addEventListener("click", async () => { if (!await confirmAction("This setting will be permanently deleted.", "Delete setting?")) return; try { await api(`${config.endpoint}/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" }); flash("Setting deleted."); loadResource(); } catch (error) { flash(error.message, "error"); } }));
}
function renderResume(profile) {
  const url = profile?.resume_url || profile?.resumeUrl || "";
  const upload = can(resources.resume, "upload") ? `<label class="primary-button upload-button"><i class="fa-solid fa-upload"></i> ${url ? "Replace resume" : "Upload resume"}<input id="resume-upload" type="file" accept="application/pdf"></label>` : "";
  const remove = can(resources.resume, "delete") && url ? '<button id="delete-resume" class="small-button danger" type="button">Delete resume</button>' : "";
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>Resume</h2><p>Upload, replace, preview, or remove your public resume.</p></div>${upload}</div><div class="resume-panel">${url ? `<a class="resume-link" href="${escapeHtml(url)}" target="_blank" rel="noopener"><i class="fa-solid fa-file-pdf"></i> Preview current resume</a>${remove}` : '<div class="empty-state">No resume uploaded yet.</div>'}</div></div>`;
  $("#resume-upload")?.addEventListener("change", uploadResume);
  $("#delete-resume")?.addEventListener("click", async () => { if (!await confirmAction("The current resume will be removed from your portfolio.", "Delete resume?")) return; try { await api("profiles/1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume_url: "" }) }); flash("Resume deleted."); loadResource("resume"); } catch (error) { flash(error.message, "error"); } });
}
async function uploadResume(event) {
  const file = event.target.files[0]; if (!file) return;
  const body = new FormData(); body.append("file", file);
  try { const media = await api("media/upload", { method: "POST", body }); await api("profiles/1", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resume_url: media.url }) }); flash("Resume uploaded."); loadResource("resume"); } catch (error) { flash(error.message, "error"); }
}
function renderExperiences(config, items, responsibilities) {
  $("#resource-panel").innerHTML = `<div class="resource-card"><div class="resource-card-header"><div><h2>Experience</h2><p>Manage experience entries and their responsibilities together.</p></div></div>${formMarkup(config)}<div class="item-list">${items.map((item) => `<div class="item-row experience-row"><div><div class="item-title">${escapeHtml(item.company)}</div><div class="item-meta">${escapeHtml(item.role)} · ${escapeHtml(item.duration)} ${item.is_active ? '<span class="status-badge">Active</span>' : '<span class="status-badge inactive">Inactive</span>'}</div><div class="responsibility-list">${responsibilities.filter((entry) => entry.experience_id === item.id).map((entry) => `<span>${escapeHtml(entry.responsibility)} ${can(resources.responsibilities || { permission: "responsibilities" }, "delete") ? `<button class="remove-responsibility" data-id="${entry.id}" type="button" aria-label="Remove responsibility" title="Remove responsibility">&times;</button>` : ""}</span>`).join("")}</div>${can(resources.responsibilities || { permission: "responsibilities" }, "create") ? `<form class="responsibility-form" data-experience="${item.id}"><input name="responsibility" placeholder="Add responsibility" required><button class="small-button" type="submit">Add</button></form>` : ""}</div><div class="item-actions">${actionMenu([...(can(config, "update") ? [`<button class="edit-item" data-item="${escapeHtml(JSON.stringify(item))}" type="button" role="menuitem"><i class="fa-solid fa-pen"></i> Edit</button>`] : []),...(can(config, "delete") ? [`<button class="danger delete-item" data-id="${item.id}" type="button" role="menuitem"><i class="fa-solid fa-trash"></i> Delete</button>`] : [])])}</div></div>`).join("")}</div></div>`;
  bindEditor(config);
  document.querySelectorAll(".edit-item").forEach((button) => button.addEventListener("click", () => { $("#resource-panel .editor-form")?.remove(); $("#resource-panel .resource-card-header").insertAdjacentHTML("afterend", formMarkup(config, JSON.parse(button.dataset.item))); bindEditor(config); }));
  document.querySelectorAll(".delete-item").forEach((button) => button.addEventListener("click", async () => { if (!await confirmAction("This experience and its entry will be permanently deleted.", "Delete experience?")) return; try { await api(`experiences/${button.dataset.id}`, { method: "DELETE" }); loadResource("experiences"); } catch (error) { flash(error.message, "error"); } }));
  document.querySelectorAll(".responsibility-form").forEach((form) => form.addEventListener("submit", async (event) => { event.preventDefault(); await api("responsibilities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experience_id: Number(form.dataset.experience), responsibility: form.elements.responsibility.value, sort_order: 99, is_active: true }) }); loadResource("experiences"); }));
  document.querySelectorAll(".remove-responsibility").forEach((button) => button.addEventListener("click", async () => { if (!await confirmAction("This responsibility will be removed from the experience.", "Remove responsibility?")) return; try { await api(`responsibilities/${button.dataset.id}`, { method: "DELETE" }); loadResource("experiences"); } catch (error) { flash(error.message, "error"); } }));
}
function bindEditor(config) {
  const form = $("#resource-panel .editor-form"); if (!form) return;
  form.querySelectorAll(".image-field-body input").forEach((input) => input.addEventListener("input", () => {
    const preview = input.closest(".image-field").querySelector(".image-field-preview");
    if (preview.tagName === "IMG") preview.src = input.value.trim();
  }));
  form.querySelectorAll(".field-upload").forEach((input) => input.addEventListener("change", async () => {
    const file = input.files[0]; if (!file) return;
    const body = new FormData(); body.append("file", file);
    try {
      const media = await api("media/upload", { method: "POST", body });
      const urlField = input.closest(".image-field").querySelector("input[name$='_url']");
      urlField.value = media.url;
      const preview = urlField.closest(".image-field").querySelector(".image-field-preview");
      preview.classList.remove("is-empty");
      if (preview.tagName === "IMG") preview.src = media.url;
      else preview.outerHTML = `<img class="image-field-preview" src="${escapeHtml(media.url)}" alt="Uploaded image">`;
      flash("Image uploaded. Save the form to apply it.");
    } catch (error) { flash(error.message, "error"); }
    input.value = "";
  }));
  form.addEventListener("submit", async (event) => { event.preventDefault(); const button = form.querySelector("button"); button.disabled = true; const body = {}; config.fields.forEach(([name,,type]) => { const input = form.elements[name]; body[name] = type === "checkbox" ? input.checked : type === "number" ? Number(input.value) : input.value.trim(); }); const id = form.dataset.id; try { await api(`${config.endpoint}${id && !config.singleton ? `/${encodeURIComponent(id)}` : id ? "/1" : ""}`, { method: id || config.singleton ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); flash(`${config.label} saved.`); loadResource(); } catch (error) { flash(error.message, "error"); button.disabled = false; } });
}
async function uploadMedia(event) { const file = event.target.files[0]; if (!file) return; const body = new FormData(); body.append("file", file); try { await api("media/upload", { method: "POST", body }); flash("File uploaded."); loadResource("media"); } catch (error) { flash(error.message, "error"); } event.target.value = ""; }
function buildNavigation() {
  const dashboard = document.createElement("button"); dashboard.className = "sidebar-link"; dashboard.dataset.resource = "dashboard"; dashboard.innerHTML = '<i class="fa-solid fa-table-cells"></i><span>Dashboard</span>'; dashboard.addEventListener("click", loadDashboard); $("#resource-nav").append(dashboard);
  const groups = [["CONTENT", ["homepage", "profile", "skills", "experiences", "projects", "resume", "media"]], ["COMMUNICATION", ["social-links", "footer"]], ["SYSTEM", ["admin-users", "audit-logs", "settings"]], ["ACCOUNT", ["change-password"]]];
  groups.forEach(([label, names]) => {
    const visible = names.filter((name) => {
      const config = resources[name];
      return can(config, "read");
    });
    if (!visible.length) return;
    const heading = document.createElement("p"); heading.className = "sidebar-label"; heading.textContent = label; $("#resource-nav").append(heading);
    visible.forEach((name) => { const config = resources[name]; const link = document.createElement("button"); link.className = "sidebar-link"; link.dataset.resource = name; link.innerHTML = `<i class="fa-solid ${config.icon}"></i><span>${config.label}</span>`; link.addEventListener("click", () => loadResource(name)); $("#resource-nav").append(link); });
  });
}
$("#login-form").addEventListener("submit", async (event) => { event.preventDefault(); const button = event.target.querySelector("button"); button.disabled = true; $("#login-error").classList.add("d-none"); try { const data = await api("login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#email").value, password: $("#password").value }) }); currentAdmin = data.admin; $("#admin-email").textContent = data.admin.email; $("#login-view").classList.add("d-none"); $("#app-view").classList.remove("d-none"); $("#resource-nav").innerHTML = ""; buildNavigation(); loadDashboard(); } catch (error) { $("#login-error").textContent = error.message; $("#login-error").classList.remove("d-none"); } finally { button.disabled = false; } });
async function logout() { await api("logout", { method: "POST" }); showLogin(); }
$("#logout").addEventListener("click", logout); $("#sidebar-logout").addEventListener("click", logout);
$("#menu-toggle").addEventListener("click", () => { $("#sidebar").classList.toggle("open"); $("#sidebar-backdrop").classList.toggle("open"); }); $("#sidebar-backdrop").addEventListener("click", () => { $("#sidebar").classList.remove("open"); $("#sidebar-backdrop").classList.remove("open"); });
document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".more-button");
  if (toggle) {
    const menu = toggle.closest(".action-menu");
    document.querySelectorAll(".action-menu.open").forEach((entry) => { if (entry !== menu) entry.classList.remove("open"); });
    menu.classList.toggle("open"); toggle.setAttribute("aria-expanded", menu.classList.contains("open"));
    if (menu.classList.contains("open")) {
      const menuBox = menu.querySelector(".action-menu-list");
      const buttonBox = toggle.getBoundingClientRect();
      menuBox.classList.toggle("align-left", buttonBox.right - 160 > window.innerWidth - 12);
      if (window.matchMedia("(max-width: 767px)").matches) {
        menuBox.style.top = `${buttonBox.bottom + 6}px`;
        requestAnimationFrame(() => {
          if (menuBox.getBoundingClientRect().bottom > window.innerHeight - 12) {
            menuBox.style.top = `${Math.max(12, buttonBox.top - menuBox.offsetHeight - 6)}px`;
          }
        });
      }
    }
  } else if (!event.target.closest(".action-menu")) document.querySelectorAll(".action-menu.open").forEach((entry) => entry.classList.remove("open"));
});
$("#forgot-password-link").addEventListener("click", () => { $("#login-form").classList.add("d-none"); $("#forgot-form").classList.remove("d-none"); $("#forgot-email").value = $("#email").value; });
$("#back-to-login").addEventListener("click", () => { $("#forgot-form").classList.add("d-none"); $("#login-form").classList.remove("d-none"); });
$("#forgot-form").addEventListener("submit", async (event) => { event.preventDefault(); try { const data = await api("forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#forgot-email").value }) }); $("#forgot-message").textContent = data.message; $("#forgot-message").className = "alert success"; } catch (error) { $("#forgot-message").textContent = "Unable to process request."; $("#forgot-message").className = "alert error"; } });
function showResetForm(token) {
  $("#login-form").classList.add("d-none"); $("#forgot-form").classList.add("d-none");
  $(".login-card").insertAdjacentHTML("beforeend", '<form id="reset-form"><p class="login-copy">Choose a new password for your admin account.</p><label for="reset-password">New password</label><input id="reset-password" type="password" minlength="12" autocomplete="new-password" required><label for="reset-confirm">Confirm new password</label><input id="reset-confirm" type="password" minlength="12" autocomplete="new-password" required><button class="primary-button full-width" type="submit">Reset password</button><div id="reset-message" class="alert d-none"></div></form>');
  $("#reset-form").addEventListener("submit", async (event) => { event.preventDefault(); const password = $("#reset-password").value; const message = $("#reset-message"); if (password !== $("#reset-confirm").value) { message.textContent = "Passwords do not match."; message.className = "alert error"; return; } try { const data = await api("reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) }); message.textContent = data.message; message.className = "alert success"; event.target.reset(); history.replaceState({}, "", location.pathname); setTimeout(() => { $("#reset-form")?.remove(); $("#login-form").classList.remove("d-none"); }, 1200); } catch (error) { message.textContent = error.message; message.className = "alert error"; } });
}
const resetToken = new URLSearchParams(location.search).get("reset");
if (!resetToken) api("session").then((data) => { currentAdmin = data.admin; $("#admin-email").textContent = data.admin.email; $("#login-view").classList.add("d-none"); $("#app-view").classList.remove("d-none"); $("#resource-nav").innerHTML = ""; buildNavigation(); loadDashboard(); }).catch(() => {});
if (resetToken) showResetForm(resetToken);
