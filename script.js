const notebook = document.getElementById("notebook");
const pages = Array.from(document.querySelectorAll(".page"));
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
let currentPage = 0;

function updatePages() {
  pages.forEach((page, index) => {
    const flipped = index < currentPage;
    page.classList.toggle("flipped", flipped);
    page.classList.toggle("active", index === currentPage);
    page.style.zIndex = pages.length - index;
    page.style.transform = flipped ? "rotateY(-180deg)" : "rotateY(0deg)";
  });

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === pages.length - 1;
}

function changePage(delta) {
  const nextPage = Math.min(pages.length - 1, Math.max(0, currentPage + delta));
  if (nextPage !== currentPage) {
    currentPage = nextPage;
    updatePages();
    const activeContent = pages[currentPage].querySelector(".page-content");
    if (activeContent) {
      activeContent.scrollTop = 0;
    }
  }
}

const stage = document.querySelector(".notebook-stage");

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") changePage(1);
  if (event.key === "ArrowLeft") changePage(-1);
});

prevBtn.addEventListener("click", () => changePage(-1));
nextBtn.addEventListener("click", () => changePage(1));

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

stage.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
  },
  { passive: true }
);

stage.addEventListener(
  "touchend",
  (event) => {
    if (!touchStartTime || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    const duration = Date.now() - touchStartTime;
    touchStartTime = 0;

    const horizontalSwipe =
      Math.abs(deltaX) > Math.abs(deltaY) &&
      Math.abs(deltaX) > 45 &&
      duration < 600;

    if (!horizontalSwipe) return;
    if (deltaX < 0) changePage(1);
    else changePage(-1);
  },
  { passive: true }
);

document.querySelectorAll(".toggle-translation").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.closest(".page");
    const translation = page.querySelector(".translation");
    const visible = translation.classList.toggle("visible");
    page.classList.toggle("translation-visible", visible);
    button.textContent = visible ? "Hide translation" : "Show translation";
  });
});

setTimeout(() => notebook.classList.add("open"), 300);
updatePages();

