'use strict';

/**
 * RSVPex Landing Page - Form Validation & Enhancement
 * Progressive enhancement - works with or without JavaScript
 */

// ================================================================
// Email Validation Regex
// ================================================================
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ================================================================
// Form References
// ================================================================
const waitlistForm = document.getElementById('waitlist-form');
const emailInput = document.getElementById('email');
const nameInput = document.getElementById('name');
const emailErrorSpan = document.getElementById('email-error');
const submitButton = waitlistForm?.querySelector('button[type="submit"]');

// ================================================================
// Validation Functions
// ================================================================

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid email format
 */
function validateEmail(email) {
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validate name (optional but if provided, must be 2+ chars)
 * @param {string} name - Name to validate
 * @returns {boolean} True if valid or empty
 */
function validateName(name) {
  const trimmed = name.trim();
  return trimmed === '' || trimmed.length >= 2;
}

/**
 * Show error message for a field
 * @param {HTMLElement} errorElement - The span to display error in
 * @param {string} message - Error message to display
 */
function showError(errorElement, message) {
  if (!errorElement) return;

  errorElement.textContent = message;
  errorElement.removeAttribute('hidden');

  // Announce to screen readers
  errorElement.setAttribute('role', 'alert');
}

/**
 * Clear error message for a field
 * @param {HTMLElement} errorElement - The span to clear
 */
function clearError(errorElement) {
  if (!errorElement) return;

  errorElement.textContent = '';
  errorElement.setAttribute('hidden', '');
}

/**
 * Validate entire form before submission
 * @returns {boolean} True if all required fields are valid
 */
function validateForm() {
  let isValid = true;

  // Validate email (required)
  if (!emailInput.value.trim()) {
    showError(emailErrorSpan, 'Email address is required');
    isValid = false;
  } else if (!validateEmail(emailInput.value)) {
    showError(emailErrorSpan, 'Please enter a valid email address');
    isValid = false;
  } else {
    clearError(emailErrorSpan);
  }

  // Validate name (optional but if provided must be valid)
  if (!validateName(nameInput.value)) {
    const nameError = nameInput.nextElementSibling;
    if (nameError && nameError.classList.contains('error')) {
      showError(nameError, 'Name must be at least 2 characters');
      isValid = false;
    }
  }

  return isValid;
}

/**
 * Sanitize input to prevent XSS
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeInput(input) {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Handle form submission
 * @param {Event} event - Form submit event
 */
function handleFormSubmit(event) {
  // Validate form before submission
  if (!validateForm()) {
    event.preventDefault();
    emailInput.focus();
    return false;
  }

  // Show loading state
  if (submitButton) {
    submitButton.classList.add('loading');
    submitButton.disabled = true;
    submitButton.textContent = 'Joining...';
  }

  // Form will submit to Web3Forms after validation passes
  // No need to preventDefault - let form submit naturally
}

/**
 * Handle real-time email validation
 * Clear error when user starts typing a valid email
 */
function handleEmailInput() {
  if (emailInput.value.trim() && validateEmail(emailInput.value)) {
    clearError(emailErrorSpan);
  }
}

/**
 * Handle real-time name validation
 */
function handleNameInput() {
  if (nameInput) {
    const nameError = nameInput.nextElementSibling;
    if (nameError && nameError.classList.contains('error')) {
      if (validateName(nameInput.value)) {
        clearError(nameError);
      }
    }
  }
}

// ================================================================
// Accessibility Enhancements
// ================================================================

/**
 * Enhance form inputs with aria-invalid for screen readers
 */
function enhanceAccessibility() {
  if (emailInput) {
    emailInput.addEventListener('invalid', (e) => {
      e.preventDefault();
      showError(emailErrorSpan, 'Please enter a valid email address');
    });
  }

  // Add aria-live region for dynamic form feedback
  if (!emailErrorSpan.getAttribute('aria-live')) {
    emailErrorSpan.setAttribute('aria-live', 'polite');
    emailErrorSpan.setAttribute('aria-atomic', 'true');
  }
}

// ================================================================
// Event Listeners
// ================================================================

if (waitlistForm) {
  // Form submission
  waitlistForm.addEventListener('submit', handleFormSubmit);

  // Real-time email validation
  if (emailInput) {
    emailInput.addEventListener('blur', () => validateForm());
    emailInput.addEventListener('input', handleEmailInput);
  }

  // Real-time name validation
  if (nameInput) {
    nameInput.addEventListener('blur', validateForm);
    nameInput.addEventListener('input', handleNameInput);
  }

  // Enhance accessibility
  enhanceAccessibility();
}

// ================================================================
// Initialization
// ================================================================

/**
 * Initialize form on page load
 */
function initForm() {
  // Clear any cached form data (optional - remove this if you want to preserve data)
  // if (waitlistForm) {
  //   waitlistForm.reset();
  // }

  // Focus on email input when page loads (optional)
  // if (emailInput) {
  //   emailInput.focus();
  // }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initForm);
} else {
  initForm();
}

// ================================================================
// Export for testing (if using modules)
// ================================================================

// For potential unit tests (uncomment if using ES modules)
// export { validateEmail, validateName, validateForm, sanitizeInput };
