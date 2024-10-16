export function createPopupMessage(scene, message, callback = null) {
    // Create a container div for the popup
    const popupContainer = document.createElement('div');
    popupContainer.style.position = 'absolute';
    popupContainer.style.left = '0';
    popupContainer.style.top = '0';
    popupContainer.style.width = '100%';
    popupContainer.style.height = '100%';
    popupContainer.style.display = 'flex';
    popupContainer.style.justifyContent = 'center';
    popupContainer.style.alignItems = 'center';
    popupContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    popupContainer.style.zIndex = '1000000';

    // Create the popup content
    const popupContent = document.createElement('div');
    popupContent.style.backgroundColor = '#ffffff';
    popupContent.style.padding = '30px 40px';
    popupContent.style.borderRadius = '15px';
    popupContent.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';
    popupContent.style.textAlign = 'center';
    popupContent.style.maxWidth = '80%';
    popupContent.style.minWidth = '300px';

    // Add the message
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.style.fontSize = '18px';
    messageElement.style.color = '#333333';
    messageElement.style.marginBottom = '20px';
    messageElement.style.lineHeight = '1.5';
    popupContent.appendChild(messageElement);

    // Add the OK button
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.style.backgroundColor = '#4CAF50';
    okButton.style.color = 'white';
    okButton.style.border = 'none';
    okButton.style.padding = '10px 25px';
    okButton.style.fontSize = '16px';
    okButton.style.borderRadius = '5px';
    okButton.style.cursor = 'pointer';
    okButton.style.transition = 'background-color 0.3s';

    okButton.addEventListener('mouseover', () => {
        okButton.style.backgroundColor = '#45a049';
    });

    okButton.addEventListener('mouseout', () => {
        okButton.style.backgroundColor = '#4CAF50';
    });

    okButton.addEventListener('click', () => {
        document.body.removeChild(popupContainer);
        if (callback) callback();
    });

    popupContent.appendChild(okButton);
    popupContainer.appendChild(popupContent);
    document.body.appendChild(popupContainer);

    // Hide the login form
    const loginForm = document.querySelector('.login-form');
    if (loginForm) {
        loginForm.style.display = 'none';
    }

    return popupContainer;
}