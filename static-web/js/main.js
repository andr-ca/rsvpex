'use strict';

(function () {
  const form = document.getElementById('waitlist-form');
  if (!form) return;

  const emailInput = document.getElementById('email');
  const nameInput  = document.getElementById('name');
  const submitBtn  = document.getElementById('submit-btn');
  const emailError = document.getElementById('email-error');
  const nameError  = document.getElementById('name-error');
  const formError  = document.getElementById('form-error');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function setError(input, errorEl, message) {
    input.setAttribute('aria-invalid', 'true');
    errorEl.textContent = message;
    errorEl.removeAttribute('hidden');
  }

  function clearError(input, errorEl) {
    input.removeAttribute('aria-invalid');
    errorEl.textContent = '';
    errorEl.setAttribute('hidden', '');
  }

  function validate() {
    let valid = true;

    const email = emailInput.value.trim();
    if (!email) {
      setError(emailInput, emailError, 'Email address is required.');
      valid = false;
    } else if (!EMAIL_RE.test(email)) {
      setError(emailInput, emailError, 'Please enter a valid email address.');
      valid = false;
    } else {
      clearError(emailInput, emailError);
    }

    const name = nameInput.value.trim();
    if (name && name.length < 2) {
      setError(nameInput, nameError, 'Name must be at least 2 characters.');
      valid = false;
    } else {
      clearError(nameInput, nameError);
    }

    return valid;
  }

  emailInput.addEventListener('input', function () {
    if (emailInput.value.trim()) {
      clearError(emailInput, emailError);
    }
  });

  nameInput.addEventListener('input', function () {
    const name = nameInput.value.trim();

    if (!name || name.length >= 2) {
      clearError(nameInput, nameError);
    }
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    formError.setAttribute('hidden', '');

    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    try {
      const formData = new FormData(form);
      const payload  = JSON.stringify(Object.fromEntries(formData));
      const res      = await fetch(form.action, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: payload
      });

      if (res.ok) {
        window.location.href = '/thank-you.html';
      } else {
        throw new Error('Server error ' + res.status);
      }
    } catch (err) {
      formError.textContent = 'Something went wrong. Please try again.';
      formError.removeAttribute('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join Waitlist';
    }
  });
}());
