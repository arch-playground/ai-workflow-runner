import os
custom_var = os.environ.get('MY_CUSTOM_VAR', '')
if custom_var == 'my_value':
    print('true')
else:
    print(f'MY_CUSTOM_VAR was: {custom_var}')
