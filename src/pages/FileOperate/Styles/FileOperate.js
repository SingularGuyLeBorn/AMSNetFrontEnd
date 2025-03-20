// 添加一些交互效果
document.querySelectorAll('.button-style').forEach(button => {
  button.addEventListener('mouseenter', () => {
    button.style.transform = 'scale(1.05)';
  });
  button.addEventListener('mouseleave', () => {
    button.style.transform = 'scale(1)';
  });
});

// 添加 canvas 的 hover 效果
const canvas = document.querySelector('.canvas-element');
canvas.addEventListener('mouseenter', () => {
  canvas.style.boxShadow = '0 0 15px rgba(0, 0, 0, 0.2)';
});
canvas.addEventListener('mouseleave', () => {
  canvas.style.boxShadow = 'none';
});
