// Shared behavior for every page: theme toggle, mobile menu, footer year,
// and the auto-updating years-of-experience figure on the home page.
(function () {
  var root = document.documentElement;

  // Theme toggle (choice is remembered per browser)
  var themeBtn = document.getElementById('themeBtn');
  if (themeBtn && !root.hasAttribute('data-theme-lock')) {
    themeBtn.addEventListener('click', function () {
      var current = root.getAttribute('data-theme') ||
        (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
    });
  }

  // Mobile menu
  var menuBtn = document.getElementById('menuBtn');
  var nav = document.getElementById('nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', nav.classList.contains('open'));
    });
  }

  // Footer year
  var year = new Date().getFullYear();
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = year; });

  // Years of experience — counts from career start year, rolls over each Jan 1.
  var CAREER_START = 2011;
  document.querySelectorAll('[data-years-exp]').forEach(function (el) { el.textContent = year - CAREER_START; });
})();
