const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'web',
  devtool: 'source-map',
  entry: path.resolve(__dirname, 'web/main.ts'),
  output: {
    path: path.resolve(__dirname, 'dist/web'),
    filename: 'bundle.js',
    clean: true
  },
  devServer: {
    static: [
      {
        directory: path.resolve(__dirname, 'web'),
      },
      {
        directory: path.resolve(__dirname, 'dist/web'),
      }
    ],
    host: 'localhost',
    port: 5173,
    hot: true,
    open: false
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: path.resolve(__dirname, 'tsconfig.json'),
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.html$/,
        use: 'raw-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'web/index.html'),
          to: path.resolve(__dirname, 'dist/web/index.html')
        },
        {
          from: path.resolve(__dirname, 'web/data'),
          to: path.resolve(__dirname, 'dist/web/data'),
          noErrorOnMissing: true
        }
      ]
    })
  ],
  optimization: {
    minimize: false
  }
};
