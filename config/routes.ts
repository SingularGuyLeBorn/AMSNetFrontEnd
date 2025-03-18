export default [
  { path: '/welcome', icon: 'home', component: './Welcome', name: 'AMSNet' },
  {
    path: '/user',
    layout: false,
    routes: [
      { path: '/user/login', component: './User/Login' },
      { path: '/user/register', component: './User/Register' },
    ],
  },
  {
    path: '/fileoperate',
    icon: 'edit',
    component: './FileOperate',
    name: 'File',
    // access: 'canUser',
  },
  {
    path: '/graphoperate',
    icon: 'edit',
    component: './GraphOperate',
    name: 'Knowledge Graph',
    // access: 'canUser',
  },
  {
    path: '/maskoperate',
    icon: 'edit',
    component: './MaskOperate',
    name: 'Mask Line',
    // access: 'canUser',
  },
  // {
  //   path: '/floatwindow',
  //   icon: 'edit',
  //   component: './FloatWindow',
  //   name: 'floatwindow',
  // },
  // {
  //   path: '/admin',
  //   icon: 'crown',
  //   name: '管理页',
  //   access: 'canAdmin',
  //   routes: [
  //     { path: '/admin', redirect: '/admin/user' },
  //     { icon: 'table', path: '/admin/user', component: './Admin/User', name: '用户管理' },
  //   ],
  // },
  { path: '/', redirect: '/welcome' },
  { path: '*', layout: false, component: './404' },
];
