module.exports = {
  extends: [require.resolve('@umijs/lint/html/config/eslint')],
  globals: {
    page: true,
    REACT_APP_ENV: true,
  },
};
