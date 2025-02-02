document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('terms-modal');
    const checkbox = document.getElementById('agree-checkbox');
    const agreeButton = document.getElementById('agree-button');
    const termsContainer = document.querySelector('.terms-container');
    
    // Enable checkbox when scrolled to bottom
    termsContainer.addEventListener('scroll', function() {
        if (termsContainer.scrollHeight - termsContainer.scrollTop <= termsContainer.clientHeight + 1) {
            checkbox.disabled = false;
        }
    });
    
    // Enable agree button when checkbox is checked
    checkbox.addEventListener('change', function() {
        agreeButton.disabled = !this.checked;
    });
    
    // Handle agree button click
    agreeButton.addEventListener('click', function() {
        fetch('/accept-terms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (response.ok) {
                modal.style.display = 'none';
                window.location.href = '/supplier-dashboard';
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('حدث خطأ أثناء حفظ موافقتك على الشروط والأحكام');
        });
    });
});
