document
  .querySelectorAll(".custom-card p.text-muted")
  .forEach((description) => {
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
