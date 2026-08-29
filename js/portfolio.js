(async () => {
  const apiBase = (window.PORTFOLIO_API_URL || "").replace(/\/$/, "");
  const response = await fetch(`${apiBase}/api/public/portfolio`);
  if (!response.ok) throw new Error("Unable to load portfolio content.");
  const data = await response.json();
  const settings = data.settings || {};
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value !== undefined) element.textContent = value;
  };
  const imageUrl = (url) => url || "";

  const intro = document.querySelector(".intro-text");
  if (intro && data.profile?.greeting) {
    const existingName = intro.querySelector(".name-highlight")?.textContent.trim() || "";
    const greeting = data.profile.greeting;
    const name = data.profile.name || "";
    const displayName = greeting.includes(name) ? name : existingName;
    const nameIndex = greeting.indexOf(displayName);
    if (nameIndex === -1) {
      intro.textContent = greeting;
    } else {
      intro.textContent = "";
      intro.append(document.createTextNode(greeting.slice(0, nameIndex)));
      const nameElement = document.createElement("span");
      nameElement.className = "name-highlight";
      nameElement.textContent = displayName;
      intro.append(nameElement, document.createTextNode(greeting.slice(nameIndex + displayName.length)));
    }
  }
  setText(".description", data.profile?.bio);
  const hero = document.querySelector(".main-character");
  if (hero && data.profile?.photoUrl) hero.src = imageUrl(data.profile.photoUrl);
  const background = document.querySelector(".bg-icons");
  if (background && data.profile?.backgroundUrl) background.src = imageUrl(data.profile.backgroundUrl);
  const resume = document.querySelector(".btn-download-cv");
  if (resume && data.profile?.resumeUrl) resume.href = data.profile.resumeUrl;

  document.querySelectorAll(".skill-table, .about-skill-table").forEach((table) => {
    table.innerHTML = data.skills.map((skill) => `<tr><td></td><td>:</td><td></td></tr>`).join("");
    table.querySelectorAll("tr").forEach((row, index) => {
      row.children[0].textContent = data.skills[index].category;
      row.children[2].textContent = data.skills[index].details;
    });
  });

  const projectRow = document.querySelector(".custom-card")?.parentElement?.parentElement;
  if (projectRow && data.projects) {
    projectRow.innerHTML = data.projects.map((project) => `
      <div class="col-12 col-md-6 col-lg-4 d-flex justify-content-center">
        <div class="card custom-card text-start">
          <div class="logo-area text-center"><img src="${imageUrl(project.logoUrl)}" alt="${project.name}" class="brand-logo" /></div>
          <h5 class="fw-bold mb-3"></h5>
          <p class="text-muted mb-4"></p>
          <div class="button-area"><a href="${project.projectUrl}" target="_blank" rel="noopener noreferrer" class="btn-visit">ভিজিট করুন</a></div>
        </div>
      </div>`).join("");
    projectRow.querySelectorAll(".custom-card").forEach((card, index) => {
      card.querySelector("h5").textContent = data.projects[index].name;
      card.querySelector("p").textContent = data.projects[index].description;
    });
  }

  const experienceList = document.querySelector(".experience-section .position-relative.ps-4");
  if (experienceList && data.experiences) {
    experienceList.innerHTML = `<div class="position-absolute h-100" style="width: 2px; left: 0; top: 0; background-color: #dee2e6;"></div>${data.experiences.map((experience, index) => `
      <div class="mb-5 position-relative">
        <div class="position-absolute rounded-circle bg-white border border-secondary shadow-sm d-flex align-items-center justify-content-center" style="width: 24px; height: 24px; left: -13px; top: 0; font-size: 10px; z-index: 2;">${index + 1}</div>
        <div class="ms-4">
          <img src="${imageUrl(experience.logoUrl)}" alt="${experience.company}" class="mb-2" style="height: 50px" />
          <h6 class="fw-bold mb-1 small text-dark"></h6>
          <p class="small text-secondary mb-2"></p>
          <div class="ps-3 border-start border-2"><p class="fw-bold small mb-0"></p><ul class="small text-muted mb-0"></ul></div>
        </div>
      </div>`).join("")}`;
    experienceList.querySelectorAll(".mb-5").forEach((item, index) => {
      const experience = data.experiences[index];
      item.querySelector("h6").append(document.createTextNode(`${experience.company} - `));
      const duration = document.createElement("span");
      duration.className = "text-muted";
      duration.textContent = `${experience.duration}.`;
      item.querySelector("h6").append(duration);
      item.querySelector("p.small.text-secondary").textContent = experience.role;
      item.querySelector(".fw-bold.small.mb-0").textContent = `Project : ${experience.project}`;
      experience.responsibilities.forEach((responsibility) => {
        const li = document.createElement("li");
        li.textContent = responsibility;
        item.querySelector("ul").append(li);
      });
    });
  }

  setText("footer .col-md-6:first-child p", settings.contact_label);
  setText("footer .col-md-6:nth-child(2) p", settings.follow_label);
  const copyright = document.querySelector(".copyright");
  if (copyright) copyright.textContent = `কপিরাইট ©${settings.copyright_year || new Date().getFullYear()} ${settings.copyright_name || data.profile?.name}। সর্বস্বত্ব সংরক্ষিত।`;
  const links = Object.fromEntries((data.socialLinks || []).map((link) => [link.label.toLowerCase(), link]));
  const contactLink = document.querySelector("footer .col-md-6:first-child .social-icons a");
  if (contactLink && links.email) contactLink.href = links.email.url;
  document.querySelectorAll("footer .col-md-6:nth-child(2) .social-icons a").forEach((link) => {
    const icon = link.querySelector("i")?.className || "";
    const match = Object.keys(links).find((label) => icon.includes(label));
    if (match) link.href = links[match].url;
  });

  document.querySelectorAll(".custom-card p.text-muted").forEach((description) => {
    if (description.nextElementSibling?.classList.contains("see-more-btn")) return;
    description.classList.add("expandable-description");
    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "see-more-btn";
    toggleButton.textContent = "See More";
    toggleButton.setAttribute("aria-expanded", "false");
    description.insertAdjacentElement("afterend", toggleButton);
    toggleButton.addEventListener("click", () => {
      const isExpanded = description.classList.toggle("is-expanded");
      toggleButton.textContent = isExpanded ? "See Less" : "See More";
      toggleButton.setAttribute("aria-expanded", String(isExpanded));
    });
  });
})().catch((error) => console.error(error));
